import { Capture } from '@/components/capture';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Capture id={(await params).id} />;
}
