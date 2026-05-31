import { OrderTracker } from './OrderTracker';

interface PageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default function OrderPage({ params }: PageProps) {
  return <OrderTracker orderId={params.id} />;
}
