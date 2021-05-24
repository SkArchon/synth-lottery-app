const open = require('open');

async function openLink() {
    // Opens the URL in the default browser.
    await open('https://kovan.chain.link/');
}

setTimeout(() => {
    openLink();
}, 5000);
