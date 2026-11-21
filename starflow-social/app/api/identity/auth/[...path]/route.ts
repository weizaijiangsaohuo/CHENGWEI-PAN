import { handleStarflowPreview } from '@/lib/starflow-preview';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){return handleStarflowPreview(request);}
export async function POST(request:Request){return handleStarflowPreview(request);}
