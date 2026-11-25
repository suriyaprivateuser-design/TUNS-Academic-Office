import { redirect } from 'next/navigation';
import { HOME_PATH } from '@/config/routes';

export default function RootPage() {
  redirect(HOME_PATH);
}
