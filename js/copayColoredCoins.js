
var module = angular.module('copayAddon.coloredCoins', ['copayAssetViewTemplates', 'ngFileUpload']);

module
    .config(function ($stateProvider) {
      $stateProvider
          .state('assets', {
            url: '/assets',
            walletShouldBeComplete: true,
            needProfile: true,
            views: {
              'main': {
                templateUrl: 'colored-coins/views/assets.html'
              }
            },
            onEnter: function($rootScope){
              $rootScope.$emit('Local/SetTab', 'assets', false);
            }
          });
    })
    .run(function (addonManager, coloredCoins, $state) {
      addonManager.registerAddon({
        formatPendingTxp: function(txp) {
          if (txp.customData && txp.customData.asset) {
            txp.amountStr = txp.customData.asset.balanceStr;
            txp.toAddress = txp.outputs[0].toAddress; // txproposal
            txp.address = txp.outputs[0].address;     // txhistory
          }
        },
        processCreateTxOpts: function(txOpts) {
          txOpts.utxosToExclude = (txOpts.utxosToExclude || []).concat(coloredCoins.getColoredUtxos());
        }
      });
    });