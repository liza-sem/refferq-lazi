import test from 'node:test';
import assert from 'node:assert/strict';
import { pinitIntegration, pinitKeyAllowed } from './pinit-integration';
const code='a'.repeat(24);
function fake(){
 const receipts=new Map<string,any>(),commissions:any[]=[];let affiliate:any=null,conversion:any=null,balance=0;
 const db:any={
 $transaction:async(fn:any)=>fn(db),$executeRawUnsafe:async()=>{},
 pinitReceipt:{findUnique:async({where}:any)=>receipts.get(where.id),create:async({data}:any)=>{receipts.set(data.id,data);return data;},update:async({where,data}:any)=>{receipts.set(where.id,{id:where.id,...data});}},
 commissionRule:{findFirst:async()=>({value:15})},programSettings:{findFirst:async()=>({commissionHoldDays:0})},
 affiliate:{findUnique:async()=>affiliate,update:async({data}:any)=>{balance+=(data.balanceCents.increment||0)-(data.balanceCents.decrement||0);}},
 user:{findUnique:async()=>null,create:async({data}:any)=>{affiliate={id:'aff',userId:'user',user:{status:'PENDING'}};return {...data,affiliate};}},
 conversion:{create:async({data}:any)=>{conversion={id:'sale',...data};return conversion;},findUnique:async()=>({...conversion,commissions}),update:async()=>{}},
 commission:{create:async({data}:any)=>{commissions.push({id:'com',payoutId:null,...data});},findMany:async()=>commissions,updateMany:async({data}:any)=>{commissions[0]={...commissions[0],...data};return {count:1};}}
 };
 return {db,receipts,commissions,get affiliate(){return affiliate;},get balance(){return balance;}};
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
