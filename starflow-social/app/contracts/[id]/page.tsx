import {StarflowCreatorContracts} from '@/components/StarflowCreatorContracts';
export const metadata={title:'协议全文与签署记录 · 星流 Starflow',robots:{index:false,follow:false}};
export default async function ContractDetailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <StarflowCreatorContracts contractId={id}/>;}
