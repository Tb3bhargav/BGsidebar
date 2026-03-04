/* Service worker for Sidebar BG Remove extension */

// Toggle sidebar open/closed when the extension action icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
});
