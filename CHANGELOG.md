Version 2.0.0
=============

- Fixed sslCert and sslPrivKey entries being ignored in the config.
- Changed ssl key creation to be done at startup instead of on npm install.
- Added error handling during master startup.
- Added instanceName entry to the config passed to instance plugins.

Breaking Changes
----------------
- Node.js versions below 10 are no longer supported.
- lib/authenticate no longer requires config to be passed to it.  Breaks
  playerManager.
- The masterIP and masterPort config entries has been merged into masterURL.
  Breaks discordChat, playerManager, serverSelect, trainTeleports and
  clusterioModel.
- Removed binary option from plugin config.
