import test from 'node:test';
import assert from 'node:assert/strict';
import { pinitIntegration, pinitKeyAllowed } from './pinit-integration';
const code='a'.repeat(24);
function fake(){
 const events=new Map<string,any>(),receipts=new Map<string,any>(),commissions:any[]=[];let affiliate:any=null,conversion:any=null,balance=0;
 const db:any={
 $transaction:async(fn:any)=>fn(db),$executeRawUnsafe:async()=>{},
 pinitReferralEvent:{findUnique:async({where}:any)=>events.get(where.id),create:async({data}:any)=>{events.set(data.id,data);return data;}},
 pinitReceipt:{findUnique:async({where}:any)=>receipts.get(where.id),create:async({data}:any)=>{receipts.set(data.id,data);return data;},update:async({where,data}:any)=>{receipts.set(where.id,{id:where.id,...data});}},
 commissionRule:{findFirst:async()=>({value:15})},programSettings:{findFirst:async()=>({commissionHoldDays:0})},
 affiliate:{findUnique:async()=>affiliate,update:async({data}:any)=>{if(data.balanceCents)balance+=(data.balanceCents.increment||0)-(data.balanceCents.decrement||0);Object.assign(affiliate,data);}},
 user:{update:async({data}:any)=>Object.assign(affiliate.user,data),findUnique:async()=>null,create:async({data}:any)=>{affiliate={id:'aff',userId:'user',pinitRewardMode:data.affiliate.create.pinitRewardMode||'cash',user:{status:'PENDING'}};return {...data,affiliate};}},
 conversion:{create:async({data}:any)=>{conversion={id:'sale',...data};return conversion;},findUnique:async()=>({...conversion,commissions}),update:async()=>{}},
 commission:{create:async({data}:any)=>{commissions.push({id:'com',payoutId:null,...data});},findMany:async()=>commissions,updateMany:async({data}:any)=>{commissions[0]={...commissions[0],...data};return {count:1};}}
 };
 return {db,events,receipts,commissions,get affiliate(){return affiliate;},get balance(){return balance;}};
}
test('enrollment is idempotent, pending until owner approval, stats do not expose customer PII',async()=>{
 const f=fake(),b={referral_code:code,external_id:'studio',email:'owner@example.test',name:'Owner'};
 const first=await pinitIntegration(f.db,'affiliate',b);assert.equal(first.status,'PENDING');assert.deepEqual(await pinitIntegration(f.db,'affiliate',b),first);
 await assert.rejects(pinitIntegration(f.db,'conversion',{referral_code:code,external_id:'tx',customer_email:'client@example.test',amount_cents:700}),/approval/);
 assert.deepEqual(await pinitIntegration(f.db,'stats',{referral_code:code}),{commissionPercent:15,status:'PENDING',earnedCents:0,pendingCents:0,paidCents:0});
});
test('payment retries return receipt, conflicting retry rejected, partial/full refunds reverse only this sale once',async()=>{
 const f=fake();await pinitIntegration(f.db,'affiliate',{referral_code:code,external_id:'studio',email:'owner@example.test',name:'Owner'});f.affiliate.user.status='ACTIVE';
 const b={referral_code:code,external_id:'tx',customer_email:'client@example.test',amount_cents:700};const sale=await pinitIntegration(f.db,'conversion',b);assert.equal(f.balance,105);assert.deepEqual(await pinitIntegration(f.db,'conversion',b),sale);assert.equal(f.commissions.length,1);
 await assert.rejects(pinitIntegration(f.db,'conversion',{...b,amount_cents:600}),/conflict/);
 const refund={...b,amount_cents:200,refund_id:'adj1'};await pinitIntegration(f.db,'refund',refund);assert.equal(f.balance,75);await pinitIntegration(f.db,'refund',refund);assert.equal(f.balance,75);
 await pinitIntegration(f.db,'refund',{...b,amount_cents:500,refund_id:'adj2'});assert.equal(f.balance,0);assert.equal(f.commissions[0].status,'CANCELLED');
});
test('invalid code/action/refund never processed',async()=>{const f=fake();await assert.rejects(pinitIntegration(f.db,'stats',{referral_code:'bad'}));await assert.rejects(pinitIntegration(f.db,'other',{referral_code:code}));});

test('server integration rejects read/write, disabled and expired keys',()=>{assert.equal(pinitKeyAllowed(null),false);assert.equal(pinitKeyAllowed({isActive:true,scopes:['read','write'],expiresAt:null}),false);assert.equal(pinitKeyAllowed({isActive:false,scopes:['admin'],expiresAt:null}),false);assert.equal(pinitKeyAllowed({isActive:true,scopes:['admin'],expiresAt:new Date(0)}),false);assert.equal(pinitKeyAllowed({isActive:true,scopes:['admin'],expiresAt:null}),true);});

test('free events are idempotent, never earn commissions, and preserve history through cash approval',async()=>{
 const f=fake(),base={referral_code:code,external_id:'studio',email:'owner@example.test',name:'Owner',referred_studio_id:'referred',reward_type:'free',occurred_at:'2026-11-09T12:00:00Z'};
 for(const kind of ['signup','reward','revoke']){
  const event={...base,event_id:kind+':referred',event_type:kind};
  assert.deepEqual(await pinitIntegration(f.db,'mirror',event),await pinitIntegration(f.db,'mirror',event));
  await assert.rejects(pinitIntegration(f.db,'mirror',{...event,occurred_at:'2026-11-10T12:00:00Z'}),/conflict/);
 }
 assert.equal(f.events.size,3);assert.equal(f.affiliate.pinitRewardMode,'free');assert.equal(f.balance,0);assert.equal(f.commissions.length,0);
 f.affiliate.user.status='ACTIVE';
 const payment={referral_code:code,external_id:'tx',customer_email:'client@example.test',amount_cents:700};
 await assert.rejects(pinitIntegration(f.db,'conversion',payment),/Free rewards/);
 await pinitIntegration(f.db,'affiliate',{referral_code:code,external_id:'studio',email:'owner@example.test',name:'Owner'});
 assert.equal(f.affiliate.pinitRewardMode,'cash');assert.equal(f.affiliate.user.status,'PENDING');assert.equal(f.events.size,3);
 await assert.rejects(pinitIntegration(f.db,'conversion',payment),/approval/);
 f.affiliate.user.status='ACTIVE';await pinitIntegration(f.db,'conversion',payment);assert.equal(f.commissions.length,1);
 // A delayed free retry never downgrades an approved cash partner.
 await pinitIntegration(f.db,'mirror',{...base,event_id:'signup:referred',event_type:'signup'});assert.equal(f.affiliate.pinitRewardMode,'cash');
});

test('payout selection and manual override reject activated free partners even with approved money',async()=>{
 const globalDb=globalThis as unknown as {prisma:unknown};const previous=globalDb.prisma;
 let selections=0;
 globalDb.prisma={
  programSettings:{findFirst:async()=>null},
  affiliate:{findUnique:async()=>({id:'free',pinitRewardMode:'free',payoutDetails:{paypalEmail:'pay@example.test'},user:{status:'ACTIVE'}})},
  commission:{findMany:async(args:{where:{affiliate?:{pinitRewardMode:unknown}}})=>{
   if(args.where.affiliate){assert.deepEqual(args.where.affiliate.pinitRewardMode,{not:'free'});selections++;return [];}
   return [{id:'approved',status:'APPROVED',amountCents:1000,payoutId:null,createdAt:new Date(0)}];
  }},
  $transaction:async()=>{throw new Error('Free payout must never reach a write transaction');},
 };
 try{
  const {listEligiblePayoutPartners,runManualPaypalPayout}=await import('./auto-payouts');
  assert.deepEqual((await listEligiblePayoutPartners({affiliateIds:['free'],skipThreshold:true})).partners,[]);assert.equal(selections,1);
  const result=await runManualPaypalPayout({actorId:'admin',affiliateId:'free',skipHold:true,enforceMin:false});
  assert.equal(result.success,false);assert.ok(result.blockers.includes('Free-project partners cannot receive payouts.'));
 }finally{globalDb.prisma=previous;}
});
