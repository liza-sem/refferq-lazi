import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRequestUserId } from '@/lib/request-user';
export async function GET(request:NextRequest){
 const id=await getRequestUserId(request);
 const user=id?await prisma.user.findUnique({where:{id}}):null;
 if(user?.role!=='ADMIN'||user.status!=='ACTIVE')return Response.json({error:'Admin access required'},{status:403});
 const before=new URL(request.url).searchParams.get('before');
 const events=await prisma.pinitReferralEvent.findMany({...(before?{cursor:{id:before},skip:1}:{}),orderBy:[{occurredAt:'desc'},{id:'desc'}],take:100});
 const affiliates=await prisma.affiliate.findMany({where:{id:{in:[...new Set(events.map(e=>e.affiliateId))]}},include:{user:{select:{name:true}}}});
 return Response.json(events.map(e=>({...e,referrer:affiliates.find(a=>a.id===e.affiliateId)?.user.name,mode:affiliates.find(a=>a.id===e.affiliateId)?.pinitRewardMode,commissionCents:e.rewardType==='free'?0:null})));
}
