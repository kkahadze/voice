const nav = document.querySelector('.mode-nav');
const trigger = document.querySelector('#mode-trigger');
const options = document.querySelector('#mode-options');
const tabs = [...document.querySelectorAll('.mode-option')];
function setOpen(open, focus = false) {
  nav.classList.toggle('open', open);
  trigger.setAttribute('aria-expanded', String(open));
  options.inert = !open;
  if (focus) (open ? tabs.find(tab => tab.getAttribute('aria-selected') === 'true') : trigger).focus();
}
trigger.addEventListener('click', () => setOpen(!nav.classList.contains('open')));
trigger.addEventListener('keydown', event => {
  if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true, true); }
});
tabs.forEach(tab => tab.addEventListener('click', () => {
  if (tab.getAttribute('aria-selected') !== 'true') window.voice?.stop();
  tabs.forEach(item => {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.querySelector('#panel-' + item.dataset.mode).hidden = !selected;
  });
  document.querySelector('#current-mode').textContent = tab.firstChild.textContent;
  setOpen(false, true);
  window.scrollTo({top:0,behavior:'instant'});
}));
options.addEventListener('keydown', event => {
  const index = tabs.indexOf(document.activeElement);
  let next;
  if (event.key === 'ArrowDown') next = (index + 1) % tabs.length;
  if (event.key === 'ArrowUp') next = (index + tabs.length - 1) % tabs.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = tabs.length - 1;
  if (next !== undefined) { event.preventDefault(); tabs[next].focus(); }
});
document.addEventListener('click', event => { if (!nav.contains(event.target)) setOpen(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && nav.classList.contains('open')) setOpen(false, true); });

// Reveal on mouse movement or touch; keep controls available during use.
const robotButton = document.querySelector('#robot-button');
let pointerOverRobot = false;
let navigationIdleTimer;
let pointerOverNavigation = false;
function scheduleNavigationHide() {
  clearTimeout(navigationIdleTimer);
  navigationIdleTimer = setTimeout(() => {
    const keyboardFocus = (nav.contains(document.activeElement) || document.activeElement === robotButton) && document.activeElement.matches(':focus-visible');
    if (nav.classList.contains('open') || pointerOverNavigation || pointerOverRobot || keyboardFocus) {
      scheduleNavigationHide();
      return;
    }
    nav.classList.remove('is-visible');
  }, 3000);
}
function revealNavigation() {
  nav.classList.add('is-visible');
  scheduleNavigationHide();
}
document.addEventListener('pointermove', event => {
  if (event.pointerType === 'mouse' || event.pointerType === 'pen') revealNavigation();
}, { passive: true });
document.addEventListener('pointerdown', revealNavigation, { passive: true });
nav.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') pointerOverNavigation = true;
});
nav.addEventListener('pointerleave', () => {
  pointerOverNavigation = false;
  scheduleNavigationHide();
});
nav.addEventListener('focusin', revealNavigation);
nav.addEventListener('focusout', scheduleNavigationHide);
document.addEventListener('keydown', event => {
  if (event.key === 'Tab') revealNavigation();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearTimeout(navigationIdleTimer);
    pointerOverNavigation = false;
    pointerOverRobot = false;
    setOpen(false);
    nav.classList.remove('is-visible');
  }
});

robotButton.addEventListener('pointerenter', event => {
  if (event.pointerType === 'mouse') pointerOverRobot = true;
});
robotButton.addEventListener('pointerleave', () => {
  pointerOverRobot = false;
  scheduleNavigationHide();
});
robotButton.addEventListener('focusin', revealNavigation);
robotButton.addEventListener('focusout', scheduleNavigationHide);
