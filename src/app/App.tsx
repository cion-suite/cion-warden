import { useUpdaterNotifications } from '@/shared/lib/updater';

import { AppRouter } from './routes';

export function App() {
    useUpdaterNotifications();
    return <AppRouter />;
}
