/** След интерфейса, переживающий перезапуск (localStorage). */
export type UiState = {
    /** Последний открытый раздел: на него ведёт DefaultRedirect. */
    lastRoute: string
    sidebarOpen: boolean
    /** Версия, чей лог уже показан; пусто - первый запуск. */
    lastShownChangelogVersion: string
}
