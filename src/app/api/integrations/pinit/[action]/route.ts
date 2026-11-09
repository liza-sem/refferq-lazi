import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { pinitIntegration, pinitKeyAllowed } from '@/lib/pinit-integration';
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
 const key=request.headers.get('x-api-key');
 const record=key?await prisma.apiKey.findFirst({where:{keyHash:createHash('sha256').update(key).digest('hex'),isActive:true}}):null;
 if(!pinitKeyAllowed(record))return Response.json({error:'Unauthorized'},{status:401});
 try{return Response.json(await pinitIntegration(prisma,(await params).action,await request.json()));}
 catch{return Response.json({error:'Integration request failed; check enrollment, payment or idempotency conflict'},{status:409});}
}
