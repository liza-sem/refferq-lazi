"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
type Event={id:string;affiliateId:string;referrer:string;referredStudioId:string;eventType:string;rewardType:string;mode:string;occurredAt:string};
export default function PinitReferrals(){
 const [events,setEvents]=useState<Event[]>([]),[error,setError]=useState(''),[before,setBefore]=useState('');
 useEffect(()=>{fetch('/api/admin/pinit-referrals'+(before?'?before='+encodeURIComponent(before):'')).then(async r=>{if(!r.ok)throw Error('Could not load referral history');setEvents(await r.json());setError('');}).catch(e=>setError(e.message));},[before]);
 return <div className="p-6 space-y-4"><h1 className="text-2xl font-bold">Pinit referrals</h1><p>Free-project rewards need no approval and pay $0. Cash partners require approval in Partners. History stays here when a partner changes mode.</p>{error&&<p role="alert">{error}</p>}<Table><TableHeader><TableRow>{['Referrer','Referred studio','Date','Status','Reward','Partner mode'].map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{events.map(e=><TableRow key={e.id}><TableCell><Link href={'/admin/partners/'+e.affiliateId}>{e.referrer}</Link></TableCell><TableCell>{e.referredStudioId}</TableCell><TableCell>{new Date(e.occurredAt).toLocaleString()}</TableCell><TableCell>{{signup:'Signed up',reward:'Rewarded',revoke:'Revoked'}[e.eventType]}</TableCell><TableCell>{e.rewardType==='free'?'Free project · $0 commission':'Cash'}</TableCell><TableCell>{e.mode==='free'?'Free rewards · payouts disabled':'Cash · approval required'}</TableCell></TableRow>)}</TableBody></Table><Button onClick={()=>setBefore('')}>Latest</Button>{events.length===100&&<Button onClick={()=>setBefore(events[events.length-1].id)}>More history</Button>}{!events.length&&!error&&<p>No mirrored referrals yet.</p>}</div>;
}
