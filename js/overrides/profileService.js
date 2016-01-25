'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('profileService', function ($delegate, $rootScope) {
    var defaultSetWalletClient = $delegate.setWalletClient;

    $delegate.setWalletClient = function (credentials) {
      defaultSetWalletClient(credentials);
      var client = $delegate.walletClients[credentials.walletId];

      if (!client) return;

      var defaultBroadcastTxProposal = client.broadcastTxProposal.bind(client);

      client.broadcastTxProposal = function (txp, opts, cb) {
        if (txp.customData && txp.customData.financeTxId) {
          $rootScope.$on('ColoredCoins/Broadcast:success', function() {
            defaultBroadcastTxProposal(txp, opts, cb);
          });
          $rootScope.$on('ColoredCoins/Broadcast:error', function(e, err) {
            cb(err);
          });

          $rootScope.$emit('ColoredCoins/BroadcastTxp', txp);
        } else {
          defaultBroadcastTxProposal(txp, opts, cb);
        }
      };

      return client;
    };
    return $delegate;
  });
});