import { Teach } from '@/components/teach';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Teach id={(await params).id} />;
}
