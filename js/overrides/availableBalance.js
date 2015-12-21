'use strict';

angular.module('copayAddon.coloredCoins').config(function ($provide) {
  $provide.decorator('availableBalanceDirective', function($delegate) {
    var directive = $delegate[0];
    directive.controller = function($rootScope, $scope, profileService, configService, coloredCoins, lodash) {
      var config = configService.getSync().wallet.settings;

      function setData(assets, walletAsset) {
        $scope.isAssetWallet = walletAsset.isAsset;
        if ($scope.isAssetWallet) {
          $scope.availableBalanceStr = walletAsset.availableBalanceStr;
          $scope.lockedBalanceStr = walletAsset.lockedBalanceStr;
          $scope.coloredBalanceStr = null;
        } else {
          var coloredBalanceSat = lodash.reduce(assets, function(total, asset) {
            total += lodash.sum(lodash.pluck(asset.utxos, 'value'));
            return total;
          }, 0);

          $scope.lockedBalanceStr = $scope.index.lockedBalanceSat;
          var availableBalanceSat = $scope.index.availableBalanceSat - coloredBalanceSat;
          $scope.availableBalanceStr = profileService.formatAmount(availableBalanceSat) + ' ' + config.unitName;
          $scope.coloredBalanceStr = profileService.formatAmount(coloredBalanceSat) + ' ' + config.unitName;
        }
      }

      coloredCoins.getAssets().then(function(assets) { 
        setData(assets, $scope.index.asset);
      });

      $rootScope.$on('Local/WalletAssetUpdated', function(event, walletAsset) {
        setData(coloredCoins.assets, walletAsset);
      });
    };
    directive.templateUrl = 'colored-coins/views/includes/available-balance.html';
    return $delegate;
  });

});