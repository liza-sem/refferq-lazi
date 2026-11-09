import { createHash, randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { commissionPercent } from './commission-rate';
export function pinitKeyAllowed(key:{isActive:boolean;scopes:unknown;expiresAt:Date|null}|null,now=Date.now()){return Boolean(key?.isActive && Array.isArray(key.scopes) && key.scopes.includes('admin') && (!key.expiresAt || key.expiresAt.getTime()>now));}
// Dependency injection permits contract tests without a live database.
export async function pinitIntegration(db:any,action:string,b:any){
 if(!['affiliate','stats','conversion','refund'].includes(action))throw new Error('Unknown action');
 if(!/^([23456789a-hjkmnp-z]{8}|[a-f0-9]{24})$/.test(b.referral_code||''))throw new Error('Invalid referral_code');
 return db.$transaction(async(tx:any)=>{
  // One affiliate serializes enrollment, payment and refund; retries share a durable receipt.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))','pinit:'+b.referral_code);
  const rule=await tx.commissionRule.findFirst({where:{isActive:true,isDefault:true,type:'PERCENTAGE'}});
  const rate=rule?commissionPercent(rule.value):15;
  let affiliate=await tx.affiliate.findUnique({where:{referralCode:b.referral_code},include:{user:true}});
  if(action==='affiliate'){
   if(!b.external_id || typeof b.email!=='string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) || typeof b.name!=='string' || b.name.length>100)throw new Error('Invalid affiliate');
   const binding=await tx.pinitReceipt.findUnique({where:{id:'affiliate:'+b.external_id}});
   if(binding){if(!affiliate || binding.result.affiliateId!==affiliate.id)throw new Error('Affiliate binding mismatch');return binding.result;}
   // Never claim an existing Refferq account by supplying its email.
   if(affiliate || await tx.user.findUnique({where:{email:b.email.toLowerCase()}}))throw new Error('Account exists; owner must resolve enrollment');
   const user=await tx.user.create({data:{email:b.email.toLowerCase(),name:b.name,password:await hash(randomBytes(48).toString('hex'),12),role:'AFFILIATE',status:'PENDING',affiliate:{create:{referralCode:b.referral_code,notifySaleEarned:false,notifyPayouts:false,notifyTierUpgraded:false}}},include:{affiliate:true}});
   const result={affiliateId:user.affiliate.id,status:user.status,commissionPercent:rate};
   await tx.pinitReceipt.create({data:{id:'affiliate:'+b.external_id,result}});return result;
  }
  if(action==='stats'){
   if(!affiliate)return {commissionPercent:rate,status:'NOT_ENROLLED',earnedCents:0,pendingCents:0,paidCents:0};
   const rows=await tx.commission.findMany({where:{affiliateId:affiliate.id}});
   const sum=(states:string[])=>rows.filter((c:any)=>states.includes(c.status)).reduce((n:number,c:any)=>n+c.amountCents,0);
   return {commissionPercent:rate,status:affiliate.user.status,earnedCents:sum(['PENDING','APPROVED','PAID']),pendingCents:sum(['PENDING','APPROVED']),paidCents:sum(['PAID'])};
  }
  if(!affiliate || ['SUSPENDED','INACTIVE'].includes(affiliate.user.status))throw new Error('Affiliate unavailable');
  if(typeof b.external_id!=='string' || b.external_id.length>100 || typeof b.customer_email!=='string' || !Number.isSafeInteger(b.amount_cents)||b.amount_cents<=0)throw new Error('Invalid payment');
  if(action==='refund' && (typeof b.refund_id!=='string'||!b.refund_id||b.refund_id.length>100))throw new Error('Invalid refund_id');
  const id=action+':'+b.external_id+(action==='refund'?':'+b.refund_id:'');
  const digest=createHash('sha256').update(JSON.stringify({code:b.referral_code,amount:b.amount_cents,email:b.customer_email})).digest('hex');
  const previous=await tx.pinitReceipt.findUnique({where:{id}});
  if(previous){if(previous.result.digest!==digest)throw new Error('Idempotency conflict');return previous.result;}
  let result:any;
  if(action==='conversion'){
   if(affiliate.user.status!=='ACTIVE')throw new Error('Affiliate awaits owner approval');
   const conversion=await tx.conversion.create({data:{affiliateId:affiliate.id,eventType:'PURCHASE',amountCents:b.amount_cents,currency:'USD',eventMetadata:{customerEmail:b.customer_email,pinitExternalId:b.external_id}}});
   const settings=await tx.programSettings.findFirst();
   // Pending affiliates require owner approval; held commissions use the existing maturity cron.
   const hold=Math.max(0,settings?.commissionHoldDays??30),approve=hold===0&&affiliate.user.status==='ACTIVE';
   const amount=Math.round(b.amount_cents*rate/100);
   await tx.commission.create({data:{conversionId:conversion.id,affiliateId:affiliate.id,userId:affiliate.userId,amountCents:amount,rate,status:approve?'APPROVED':'PENDING',maturesAt:new Date(Date.now()+hold*86400000)}});
   if(approve)await tx.affiliate.update({where:{id:affiliate.id},data:{balanceCents:{increment:amount}}});
   result={conversionId:conversion.id,originalCommission:amount,refundedCents:0,digest};
  }else{
   const receipt=await tx.pinitReceipt.findUnique({where:{id:'conversion:'+b.external_id}});
   if(!receipt)throw new Error('Conversion has not arrived');
   const sale=receipt.result;
   const conversion=await tx.conversion.findUnique({where:{id:sale.conversionId},include:{commissions:true}});
   if(!conversion || conversion.affiliateId!==affiliate.id)throw new Error('Conversion mismatch');
   const before=sale.refundedCents||0,after=Math.min(conversion.amountCents,before+b.amount_cents);
   const delta=Math.round(sale.originalCommission*after/conversion.amountCents)-Math.round(sale.originalCommission*before/conversion.amountCents);
   for(const c of conversion.commissions){
    if(['CANCELLED','CLAWBACK'].includes(c.status))continue;
    if(c.payoutId && c.status!=='PAID')throw new Error('Payout in progress; retry after payout settles');
    // Lock against the owner/cron updating this commission while its balance is adjusted.
    const changed=await tx.commission.updateMany({where:{id:c.id,status:c.status,amountCents:c.amountCents,payoutId:c.payoutId},data:{amountCents:Math.max(0,c.amountCents-delta),...(after===conversion.amountCents?{status:c.status==='PAID'?'CLAWBACK':'CANCELLED'}:{}),clawbackNote:'Pinit refund '+b.refund_id}});
    if(changed.count!==1)throw new Error('Commission changed; retry');
    if(['APPROVED','PAID'].includes(c.status))await tx.affiliate.update({where:{id:affiliate.id},data:{balanceCents:{decrement:delta}}});
   }
   if(after===conversion.amountCents)await tx.conversion.update({where:{id:conversion.id},data:{status:'REJECTED'}});
   await tx.pinitReceipt.update({where:{id:'conversion:'+b.external_id},data:{result:{...sale,refundedCents:after}}});
   result={reversedCents:delta,digest};
  }
  await tx.pinitReceipt.create({data:{id,result}});return result;
 });
}
