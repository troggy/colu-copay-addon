'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('txFormatService', function ($delegate, $rootScope) {
    var defaultProcessTx = $delegate.processTx;

    $delegate.processTx = function (tx) {
      defaultProcessTx(tx);

      tx.isAsset = !!(tx.customData && tx.customData.asset) || tx.isColored;
      if (tx.isAsset) {
        tx.amountStr = tx.customData.asset.balanceStr;
        tx.addressTo = tx.outputs[0].address;
        tx.hasMultiplesOutputs = false;
        tx.alternativeAmountStr = '';
      }

      return tx;
    };
    return $delegate;
  });
});
