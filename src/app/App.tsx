import { useUpdaterErrorToast } from '@/shared/lib/updater';

import { AppRouter } from './routes';

export function App() {
    useUpdaterErrorToast();
    return <AppRouter />;
}
