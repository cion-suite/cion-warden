/** Хвост крошек; onBack делает заголовок раздела кнопкой. */
export type NavbarCrumb = {
    label: string
    onBack?: () => void
};
