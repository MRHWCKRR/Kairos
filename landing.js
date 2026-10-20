// Static content stays readable without JavaScript; only mobile navigation needs state.
document.addEventListener('DOMContentLoaded', () => {
    const menu = document.querySelector('.menu-toggle');
    const links = document.querySelector('.nav-links');
    if (!menu || !links) return;
    function closeMenu() {
        links.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
    }
    menu.addEventListener('click', () => {
        menu.setAttribute('aria-expanded', String(links.classList.toggle('open')));
    });
    links.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || menu.getAttribute('aria-expanded') !== 'true') return;
        closeMenu();
        menu.focus();
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('.navbar')) closeMenu();
    });
});
