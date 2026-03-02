const gameButtons = document.querySelectorAll('button[data-game]');
const openSettingsBtn = document.getElementById('openSettingsBtn');

for (const gameButton of gameButtons) {
  gameButton.addEventListener('click', () => {
    const game = gameButton.getAttribute('data-game');
    if (!game) {
      return;
    }
    window.location.href = `./games/${game}/${game}.html`;
  });
}

if (openSettingsBtn) {
  openSettingsBtn.addEventListener('click', () => {
    window.location.href = './settings.html';
  });
}
