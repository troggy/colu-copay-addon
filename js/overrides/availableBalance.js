'use strict';

angular.module('copayAddon.coloredCoins').config(function ($provide) {
  $provide.decorator('availableBalanceDirective', function($delegate) {
    var directive = $delegate[0];
    directive.controller = function($rootScope, $scope, profileService, configService, coloredCoins, lodash) {
      var config = configService.getSync().wallet.settings;

      function setData(assets) {
        $scope.isAssetWallet = $scope.index.walletAsset ? $scope.index.walletAsset.isAsset : false;
        if ($scope.isAssetWallet) {
          $scope.availableBalanceStr = $scope.index.totalAssetBalanceStr;
          $scope.coloredBalanceStr = null;
        } else {
          var coloredBalanceSat = lodash.reduce(assets, function(total, asset) {
            total += lodash.sum(lodash.pluck(asset.utxos, 'value'));
            return total;
          }, 0);

          var availableBalanceSat = $scope.index.availableBalanceSat - coloredBalanceSat;
          $scope.availableBalanceStr = profileService.formatAmount(availableBalanceSat) + ' ' + config.unitName;
          $scope.coloredBalanceStr = profileService.formatAmount(coloredBalanceSat) + ' ' + config.unitName;
        }
      }

      setData(coloredCoins.assets);

      $rootScope.$on('Local/AssetBalanceUpdated', function(event) {
        setData(coloredCoins.assets);
      });
    };
    directive.templateUrl = 'colored-coins/views/includes/available-balance.html';
    return $delegate;
  });

});