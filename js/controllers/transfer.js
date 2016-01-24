'use strict';

var AssetTransferController = function ($rootScope, $scope, $modalInstance, $timeout, $log, coloredCoins, gettext,
                                        profileService, feeService, lodash, bitcore, txStatus) {

  ProcessingTxController.call(this, $rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
      lodash, bitcore, txStatus, $modalInstance);

  var self = this;

  $scope.onQrCodeScanned = function (data) {
    this.error = '';
    var form = this.assetTransferForm;
    if (data) {
      form.address.$setViewValue(new bitcore.URI(data).address.toString());
      form.address.$isValid = true;
      form.address.$render();
      $scope.lockAddress = true;
    }

    if (form.address.$invalid) {
      $scope.resetError();
      $scope.lockAddress = false;
      $scope._address = null;
      this.error = gettext('Could not recognize a valid Bitcoin QR Code');
    }
  };

  $scope.transferAsset = function (transfer, form) {
    if ($scope.asset.locked) {
      self._setError({ message: "Cannot transfer locked asset" });
      return;
    }

    if (form.$invalid) {
      this.error = gettext('Unable to send transaction proposal');
      return;
    }

    coloredCoins.sendTransferTxProposal(transfer._amount, transfer._address, transfer._comment, $scope.asset, function(err, txp) {
      if (err) {
        self.setOngoingProcess();
        profileService.lockFC();
        return self._handleError(err);
      }
      
      if (!fc.canSign() && !fc.isPrivKeyExternal()) {
        $log.info('No signing proposal: No private key')
        self.setOngoingProcess();
        self.resetForm();
        txStatus.notify(txp, function() {
          return $scope.$emit('Local/TxProposalAction');
        });
        return;
      }

      self.signAndBroadcast(txp, function(err) {
        self.setOngoingProcess();
        self.resetForm();
        if (err) {
          self.error = err.message ? err.message : gettext('The payment was created but could not be completed. Please try again from home screen');
          $scope.$emit('Local/TxProposalAction');
          $timeout(function() {
            $scope.$digest();
          }, 1);
        } else {
          self.$scope.cancel();
        }
      });
    });
  };
};

AssetTransferController.prototype = Object.create(ProcessingTxController.prototype);
