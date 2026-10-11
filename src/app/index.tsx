import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import { AppProvider } from './AppProvider';
import { initI18n } from '@/lib/i18n';
import { migrateLegacyState } from '@/lib/state';
import { uiTheme } from '@/ui/theme';
import './styles/index.css';

// До initI18n: миграция пишет язык в settings
migrateLegacyState();
initI18n();
uiTheme.follow();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AppProvider>
            <App />
        </AppProvider>
    </StrictMode>,
);
