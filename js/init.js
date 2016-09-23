
angular.module('copayAddon.colu')
    .run(function (addonManager, coloredCoins, $state) {
      addonManager.registerAddon({
        processCreateTxOpts: function(txOpts) {
          txOpts.utxosToExclude = (txOpts.utxosToExclude || []).concat(coloredCoins.getColoredUtxos());
        }
      });
    });
