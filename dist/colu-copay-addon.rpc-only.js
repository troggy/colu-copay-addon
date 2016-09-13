var coluCopayModule = angular.module('copayAddon.colu', []);


angular.module('copayAddon.colu')
    .config(function ($stateProvider) {
      $stateProvider
          .state('assets', {
            url: '/assets',
            walletShouldBeComplete: true,
            needProfile: true,
            views: {
              'main': {
                templateUrl: 'colu-copay-addon/views/assets.html'
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
            txp.amountStr = txp.customData.asset.balanceStr || txp.amountStr + '(colored)';
            txp.isColored = true;
            txp.toAddress = txp.outputs[0].toAddress; // txproposal
            txp.address = txp.outputs[0].address;     // txhistory
          }
        },
        processCreateTxOpts: function(txOpts) {
          txOpts.utxosToExclude = (txOpts.utxosToExclude || []).concat(coloredCoins.getColoredUtxos());
        }
      });
    });
'use strict';

angular.module('copayAddon.colu').config(function ($provide) {
  $provide.decorator('availableBalanceDirective', function($delegate) {
    var directive = $delegate[0];
    directive.controller = function($rootScope, $scope, profileService, configService, coloredCoins, lodash) {
      var config = configService.getSync().wallet.settings;

      function setData(assets, walletAsset) {
        $scope.isAssetWallet = walletAsset.isAsset;
        if ($scope.isAssetWallet) {
          $scope.availableBalanceStr = walletAsset.availableBalanceStr;
          $scope.showLockedBalance = !!walletAsset.lockedAmount;
          $scope.lockedBalanceStr = walletAsset.lockedBalanceStr;
          $scope.coloredBalanceStr = null;
        } else {
          var coloredBalanceSat = lodash.reduce(assets, function(total, asset) {
            total += lodash.sum(lodash.pluck(asset.utxos, 'value'));
            return total;
          }, 0);

          $scope.showLockedBalance = !!$scope.index.lockedBalanceSat;
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
    directive.templateUrl = 'colu-copay-addon/views/includes/available-balance.html';
    return $delegate;
  });

});
'use strict';

/*
  Replace Copay's splash and disclaimer screens with single landing page
 */

angular.module('copayAddon.colu').config(function ($stateProvider) {

  $stateProvider.decorator('views', function (state, parent) {
    var views = parent(state);
    return views;
    // replace both default 'splash' and 'disclaimer' states with a single one
    if (state.name == 'splash' || state.name == 'disclaimer') {
      views['main@'].templateUrl = 'colu-copay-addon/views/landing.html';
      views['main@'].controller = function($scope, $timeout, $log, profileService, applicationService) {
        profileService.isDisclaimerAccepted(function(val) {
          $scope.agreed = val;
          $timeout(function() {
            $scope.$digest();
          }, 1);
        });

        $scope.goHome = function() {
          applicationService.restart();
        };

        $scope.agreeAndCreate = function(noWallet) {
          profileService.setDisclaimerAccepted(function(err) {

            if (profileService.profile) {
              $timeout(function() {
                applicationService.restart();
              }, 1000);
              return;
            }

            $scope.creatingProfile = true;

            profileService.create({
              noWallet: noWallet
            }, function(err) {
              if (err) {
                $scope.creatingProfile = false;
                $log.warn(err);
                $scope.error = err;
                $scope.$apply();
                $timeout(function() {
                  $scope.create(noWallet);
                }, 3000);
              }
            });
          });

        };
      }

    }

    return views;
  });

});
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
          var disableSuccessListener, disableErrorListener;
          disableSuccessListener = $rootScope.$on('ColoredCoins/Broadcast:success', function() {
            disableSuccessListener();
            disableErrorListener();
            defaultBroadcastTxProposal(txp, opts, cb);
          });
          disableErrorListener = $rootScope.$on('ColoredCoins/Broadcast:error', function(e, err) {
            disableSuccessListener();
            disableErrorListener();
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
'use strict';

angular.module('copayAddon.colu').config(function ($provide) {

  $provide.decorator('txStatus', function($delegate) {
    var defaultTemplateUrl = $delegate._templateUrl;
    $delegate._templateUrl = function(type, txp) {
      if (txp.customData && txp.customData.asset) {
        return txp.customData.asset.action == 'transfer'
            ? 'colu-copay-addon/views/modals/transfer-status.html'
            : 'colu-copay-addon/views/modals/issue-status.html';
      }
      return defaultTemplateUrl(type, txp);
    };
    return $delegate;
  });
});
'use strict';

angular.module('copayAddon.colu')
    .controller('assetsController', function ($rootScope, $scope, $timeout, $modal, isCordova, coloredCoins) {
      var self = this;

      coloredCoins.getAssets().then(function(assets) {
          self.assets = assets;
      });
      this.error = coloredCoins.error;

      var disableAssetListener = $rootScope.$on('ColoredCoins/AssetsUpdated', function (event, assets) {
        self.assets = assets;
      });

      var disableErrorListener = $rootScope.$on('ColoredCoins/Error', function (event, errorMsg) {
        self.error = errorMsg;
      });

      var disableOngoingProcessListener = $rootScope.$on('Addon/OngoingProcess', function(e, name) {
        self.setOngoingProcess(name);
      });

      $scope.$on('$destroy', function () {
        disableAssetListener();
        disableOngoingProcessListener();
        disableErrorListener();
      });

      this.setOngoingProcess = function(name) {
        var self = this;
        self.blockUx = !!name;

        if (isCordova) {
          if (name) {
            window.plugins.spinnerDialog.hide();
            window.plugins.spinnerDialog.show(null, name + '...', true);
          } else {
            window.plugins.spinnerDialog.hide();
          }
        } else {
          self.onGoingProcess = name;
          $timeout(function() {
            $rootScope.$apply();
          });
        }
      };

      // show ongoing process if any
      this.setOngoingProcess(coloredCoins.onGoingProcess);

      var hideModal = function () {
        var m = angular.element(document.getElementsByClassName('reveal-modal'));
        m.addClass('slideOutDown');
      };

      this.openTransferModal = function (asset) {
        $scope.asset = asset;

        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/send.html',
          scope: $scope,
          windowClass: 'full animated slideInUp',
          controller: AssetTransferController
        });

        modalInstance.result.finally(hideModal);
      };

      this.openAssetModal = function (asset) {
        var ModalInstanceCtrl = function ($rootScope, $scope, $modalInstance, insight, profileService) {
          $scope.asset = asset;
          insight = insight.get();
          insight.getTransaction(asset.issuanceTxid, function (err, tx) {
            if (!err) {
              $scope.issuanceTx = tx;
            }
          });
          $scope.openTransferModal = self.openTransferModal;

          $scope.openBlockExplorer = function (asset) {
            var url = 'http://coloredcoins.org/explorer/';
            var networkSuffix = profileService.focusedClient.credentials.network == 'testnet' ? 'testnet/' : '';
            $rootScope.openExternalLink(url + networkSuffix + 'tx/' + asset.issuanceTxid);
          };

          $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
          };
        };
        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/asset-details.html',
          windowClass: 'full animated slideInUp',
          controller: ModalInstanceCtrl
        });

        modalInstance.result.finally(hideModal);
      };

      this.openIssueModal = function () {

        var modalInstance = $modal.open({
          templateUrl: 'colu-copay-addon/views/modals/issue.html',
          windowClass: 'full animated slideInUp',
          controller: AssetIssueController
        });

        modalInstance.result.finally(hideModal);
      };
    });
'use strict';

function ProcessingTxController($rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
                                lodash, bitcore, txStatus, $modalInstance) {
  this.$rootScope = $rootScope;
  this.profileService = profileService;
  this.$log = $log;
  this.gettext = gettext;
  this.bitcore = bitcore;
  this.coloredCoins = coloredCoins;
  this.feeService = feeService;
  this._ = lodash;
  this.$scope = $scope;
  this.$timeout = $timeout;
  this.txStatus = txStatus;
  this.$modalInstance = $modalInstance;

  var self = this;

  $scope.error = '';

  $scope.resetError = function () {
    self.error = self.success = null;
  };

  $scope.cancel = function () {
    self.$modalInstance.dismiss('cancel');
  };
}

ProcessingTxController.prototype.setOngoingProcess = function (name) {
  this.$rootScope.$emit('Addon/OngoingProcess', name);
};

ProcessingTxController.prototype._setError = function (err) {
  var fc = this.profileService.focusedClient;
  this.$log.error(err);
  var errMessage = fc.credentials.m > 1
      ? this.gettext('Could not create transaction proposal')
      : this.gettext('Could not perform transaction');

  //This are abnormal situations, but still err message will not be translated
  //(the should) we should switch using err.code and use proper gettext messages
  err.message = err.error ? err.error : err.message;
  errMessage = errMessage + '. ' + (err.message ? err.message : this.gettext('Check you connection and try again'));

  this.$scope.error = errMessage;

};

ProcessingTxController.prototype._handleError = function(err) {
  this.setOngoingProcess();
  this.profileService.lockFC();
  return this._setError(err);
};

ProcessingTxController.prototype._signAndBroadcast = function (txp, cb) {
  var self = this,
  		fc = self.profileService.focusedClient;
  self.setOngoingProcess(self.gettext('Signing transaction'));
  fc.signTxProposal(txp, function (err, signedTxp) {
    self.profileService.lockFC();
    self.setOngoingProcess();
    if (err) {
      err.message = self.gettext('Transaction was created but could not be signed. Please try again from home screen.') + (err.message ? ' ' + err.message : '');
      return cb(err);
    }

    if (signedTxp.status == 'accepted') {
      self.setOngoingProcess(self.gettext('Broadcasting transaction'));
      fc.broadcastTxProposal(signedTxp, function (err, btx, memo) {
        self.setOngoingProcess();
        if (err) {
          err.message = self.gettext('Transaction was signed but could not be broadcasted. Please try again from home screen.') + (err.message ? ' ' + err.message : '');
          return cb(err);
        }

        return cb(null, btx);
      });
    } else {
      self.setOngoingProcess();
      return cb(null, signedTxp);
    }
  });
};

ProcessingTxController.prototype._createAndExecuteProposal = function (txHex, toAddress, customData) {
  var self = this;
  var fc = self.profileService.focusedClient;
  var tx = new self.bitcore.Transaction(txHex);
  self.$log.debug(JSON.stringify(tx.toObject(), null, 2));

  var inputs = self._.map(tx.inputs, function (input) {
    input = input.toObject();
    var storedInput = self.coloredCoins.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
        || self.coloredCoins.scriptToUTXO[input.script || input.scriptPubKey];
    input.publicKeys = storedInput.publicKeys;
    input.path = storedInput.path;

    if (!input.txid) {
      input.txid = input.prevTxId;
    }
    if (!input.satoshis) {
      input.satoshis = 0;
    }
    return input;
  });

  var outputs = self._.chain(tx.outputs)
      .map(function (o) {
        return { script: o.script.toString(), amount: o.satoshis };
      })
      .value();

  // for Copay to show recipient properly
  outputs[0].toAddress = toAddress;

  self.setOngoingProcess(self.gettext('Creating tx proposal'));
  self.feeService.getCurrentFeeValue(null, function (err, feePerKb) {
    if (err) self.$log.debug(err);
    fc.sendTxProposal({
      type: 'external',
      inputs: inputs,
      outputs: outputs,
      noOutputsShuffle: true,
      message: '',
      payProUrl: null,
      feePerKb: feePerKb,
      fee: 1000,
      customData: customData
    }, function (err, txp) {
      if (err) {
        return self._handleError(err);
      }

      self._signAndBroadcast(txp, function (err, tx) {
        self.setOngoingProcess();
        self.profileService.lockFC();
        if (err) {
          self.error = err.message ? err.message : self.gettext('Transaction proposal was created but could not be completed. Please try again from home screen');
          self.$scope.$emit('Local/TxProposalAction');
          self.$timeout(function() {
            self.$scope.$digest();
          }, 1);
        } else {
          self.txStatus.notify(tx, function () {
            self.$scope.$emit('Local/TxProposalAction');
          });
        }
        self.$scope.cancel();
      });
    });
  });
};

'use strict';

var AssetIssueController = function ($rootScope, $scope, $modalInstance, $timeout, $log, coloredCoins, gettext,
                                     profileService, feeService, lodash, bitcore, txStatus, ccConfig, Upload,
                                     ccFeeService, configService, insight) {

  ProcessingTxController.call(this, $rootScope, $scope, $timeout, $log, coloredCoins, gettext, profileService, feeService,
      lodash, bitcore, txStatus, $modalInstance, insight);

  var self = this;

  $scope.issuance = {
    userData: []
  };

  $scope.estimatedCost = '...';

  ccFeeService.estimateCostOfIssuance(function(err, fee, totalCost) {
    if (err) {
      return self._handleError(err);
    }
    var config = configService.getSync().wallet.settings;
    $scope.estimatedCost = profileService.formatAmount(totalCost) + ' ' + config.unitName;
    $scope.$digest();
  });

  $scope.addField = function() {
    $scope.issuance.userData.push({ name: '', value: ''});
  };

  $scope.removeField = function(field) {
    lodash.pull($scope.issuance.userData, field);
  };

  var createAsset = function(issuance, iconData) {
    self.setOngoingProcess(gettext('Creating issuance transaction'));
    coloredCoins.createIssueTx(issuance, function (err, result) {
      if (err) {
        self._handleError(err);
      }

      var tx = {
        status: 'broadcasted',
        customData: {
          asset: {}
        }
      };

      txStatus.notify(tx, function () {
        self.$scope.$emit('Local/TxProposalAction');
      });
    });
  };

  var createAssetWithIcon = function(issuance, icon) {
    Upload.upload({
      url: ccConfig.uploadHost + '/upload',
      file: icon
    }).success(function (iconData, status, headers, config) {
      if (!iconData.url || iconData.url.indexOf('https://s3') != 0) {
        console.log('Error uploading: ' + status + ' ' + iconData);
        return self._handleError({ error: 'Failed to upload icon'});
      }
      console.log('Icon uploaded. URL: ' + iconData);
      issuance.urls = [
        {
          name: "icon",
          url: iconData.url,
          mimeType: iconData.mimeType
        }];
      createAsset(issuance, iconData);
    }).error(function (data, status, headers, config) {
      console.log('error uploading icon: ' + status + " " + data);
      self._handleError({ error: "Failed to upload icon" });
    })
  };

  $scope.issueAsset = function (form) {
    if (form.$invalid) {
      this.error = gettext('Unable to send transaction proposal');
      return;
    }

    var fc = profileService.focusedClient;
    if (fc.isPrivKeyEncrypted()) {
      profileService.unlockFC(function (err) {
        if (err) return self._setError(err);
        return $scope.issueAsset(form);
      });
      return;
    }

    if (this.file) {
      createAssetWithIcon(this.issuance, this.file);
    } else {
      createAsset(this.issuance);
    }
  };
};

AssetIssueController.prototype = Object.create(ProcessingTxController.prototype);

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

'use strict';


angular.module('copayAddon.colu')
    .service('ccFeeService', function (profileService, feeService, $log) {
      var SATOSHIS_FOR_ISSUANCE_COLORING = 1300,
          SATOSHIS_FOR_TRANSFER_COLORING = 600,
          root = {};

      // from BWS TxProposal.prototype.getEstimatedSize
      var _getEstimatedSize = function(nbInputs, nbOutputs) {
        var credentials = profileService.focusedClient.credentials;
        // Note: found empirically based on all multisig P2SH inputs and within m & n allowed limits.
        var safetyMargin = 0.05;
        var walletM = credentials.m;

        var overhead = 4 + 4 + 9 + 9;
        var inputSize = walletM * 72 + credentials.n * 36 + 44;
        var outputSize = 34;
        nbOutputs = nbOutputs + 1;

        var size = overhead + inputSize * nbInputs + outputSize * nbOutputs;

        return parseInt((size * (1 + safetyMargin)).toFixed(0));
      };

      root.estimateFee = function(nbInputs, nbOutputs, cb) {
        feeService.getCurrentFeeValue(null, function(err, feePerKb) {
          if (err) $log.debug(err);

          var size = _getEstimatedSize(nbInputs, nbOutputs);
          $log.debug("Estimated size: " + size);
          var fee = feePerKb * size / 1000;
          fee = parseInt(fee.toFixed(0));
          $log.debug("Estimated fee: " + fee);
          return cb(null, fee);
        });
      };

      root.estimateCostOfIssuance = function(cb) {
        var nInputs = 1; // issuing address
        var nOutputs = 3; // outputs for issuance coloring scheme

        root.estimateFee(nInputs, nOutputs, function(err, fee) {
          var amount = fee + SATOSHIS_FOR_ISSUANCE_COLORING;
          $log.debug("Estimated cost of issuance: " + amount);
          return cb(err, fee, amount);
        });
      };

      root.estimateCostOfTransfer = function(transferUnits, totalUnits, cb) {
        var hasChange = transferUnits < totalUnits;

        var nInputs = 2; // asset address + finance utxo
        // 2 outputs if spending without change: colored UTXO + OP_RETURN
        // 3 outputs if spending with change: colored UTXO + OP_RETURN + colored UTXO with change
        var nOutputs = hasChange ? 3 : 2;

        root.estimateFee(nInputs, nOutputs, function(err, fee) {
          // We need extra satoshis if we have change transfer, these will go to change UTXO
          var amount = hasChange ? fee + SATOSHIS_FOR_TRANSFER_COLORING : fee;
          $log.debug("Estimated cost of transfer: " + amount);
          return cb(err, fee, amount);
        });
      };

      return root;
    });

'use strict';

function ColoredCoins($rootScope, profileService, addressService, coluRpc, $log,
                      $q, $timeout, lodash, configService, bitcore, supportedAssets) {
  var root = {},
      lockedUtxos = [],
      self = this;
      
      
  self.txs = $q.defer(),
  self.assets = $q.defer();
  self._queued = {};
  self.isAvailable = false;
  self.supportedAssets = supportedAssets;

  // UTXOs "cache"
  root.txidToUTXO = {};
  root.assets = null;
  root.txs = null;
  root.assetsMap = {};
  root.error = null;

  var disableFocusListener = $rootScope.$on('Local/NewFocusedWallet', function() {
    root.assets = null;
    root.assetsMap = {};
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
  });
  
  var _setOngoingProcess = function(name) {
    $rootScope.$emit('Addon/OngoingProcess', name);
    root.onGoingProcess = name;
  };
  
  var disableBalanceListener = $rootScope.$on('Local/BalanceUpdated', function (event, balance) {
    root.assets = null;
    root.assetsMap = null;
    root.error = null;
    self.txs = $q.defer();
    self.assets = $q.defer();
    self.isAvailable = false;
    $rootScope.$emit('ColoredCoins/Error', null);
    var addresses = lodash.pluck(balance.byAddress, 'address');
    
    $q.all([root.getAssets(), root.getColorTransactions()]).then(function(result) {
      self.isAvailable = true;
      lodash.values(self._queued).forEach(function(callback) {
        $timeout(function() {
          callback(result[0], result[1]);
        }, 1);
      });
      self._queued = {};
    });

    if (addresses.length) {
      coluRpc.getTransactions(addresses, function(err, body) {
        if (err) {
          self.txs.reject(err);
        } else {
          var txMap = lodash.reduce(body, function(map, tx) {
            map[tx.txid] = tx;
            return map;
          }, {});
          root.txs = txMap;
          self.txs.resolve(txMap);
        }
      });
    }

    _setOngoingProcess('Getting assets');
    _fetchAssets(addresses, function (err, assetsMap) {
      if (err) {
        var msg = err.error || err.message || err.code;
        root.error = msg;
        self.assets.reject(msg);
        $rootScope.$emit('ColoredCoins/Error', msg);
        $log.error(msg);
      } else {
        root.assets = lodash.values(assetsMap);
        self.assets.resolve(root.assets);
        root.assetsMap = assetsMap;
        $rootScope.$emit('ColoredCoins/AssetsUpdated', root.assets);
      }
      _setOngoingProcess();
    });
  });
  
  root.whenAvailable = function(cb) {
    if (self.isAvailable) {
      $timeout(function() {
        cb(root.assets, root.txs);
      }, 1);
    } else {
      self._queued[cb] = cb;
    }
  };

  $rootScope.$on('$destroy', function() {
    disableBalanceListener();
    disableFocusListener();
  });

  var extractAssets = function(addressInfo) {
    var assets = [];
    if (!addressInfo.utxos || addressInfo.utxos.length == 0) return assets;

    addressInfo.utxos.forEach(function(utxo) {
      if (utxo.assets && utxo.assets.length > 0) {
        var utxoToKeep = lodash.pick(utxo, [ 'txid', 'index', 'value', 'scriptPubKey'])
        var utxoAssets = lodash
          .chain(utxo.assets)
          .reduce( function(map, asset) {
            var assetSummary = map[asset.assetId];
            if (!assetSummary) {
              map[asset.assetId] = assetSummary = { 
                amount: 0, 
                assetId: asset.assetId,
                utxo: utxoToKeep
              };
            }
            assetSummary.amount += asset.amount;
            return map;
          }, {})
          .values()
          .value();
        assets = assets.concat(utxoAssets);
      }
    });

    return assets;
  };

  var _updateLockedUtxos = function(cb) {
    var fc = profileService.focusedClient;
    fc.getUtxos({}, function(err, utxos) {
      if (err) { return cb(err); }
      _setLockedUtxos(utxos);

      root.txidToUTXO = {};
      root.scriptToUTXO = {};
      lodash.each(utxos, function(utxo) {
        root.txidToUTXO[utxo.txid + ":" + utxo.vout] = utxo;
        root.scriptToUTXO[utxo.scriptPubKey] = utxo;
      });
      cb();
    });
  };

  var _setLockedUtxos = function(utxos) {
    self.lockedUtxos = lodash.chain(utxos)
        .filter('locked')
        .map(function(utxo) { return utxo.txid + ":" + utxo.vout; })
        .value();
  };

  var _extractAssetIcon = function(metadata) {
    var icon = lodash.find(lodash.property('metadataOfIssuence.data.urls')(metadata) || [], function(url) { return url.name == 'icon'; });
    return icon ? icon.url : null;
  };

  root.getColorTransactions = function() {
    return self.txs.promise;
  };
  
  root.getAssets = function() {
    return self.assets.promise;
  };

  root.getColoredUtxos = function() {
    return lodash.map(lodash.flatten(lodash.pluck(root.assets, 'utxos')), function(utxo) { return utxo.txid + ":" + utxo.index; });
  };

  var _fetchAssets = function(addresses, cb) {
    if (addresses.length == 0) {
      return cb(null, {});
    }
    _updateLockedUtxos(function(err) {
      if (err) { return cb(err); }

      var assetsMap = {},
          assetPromises = lodash.map(addresses, function (address) {
            return _getAssetsForAddress(address, assetsMap);
          });
      
      $q.all(assetPromises).then(function() {
        lodash.each(lodash.values(assetsMap), function(asset) {
            asset.unitSymbol = root.getAssetSymbol(asset.assetId, asset);
            asset.balanceStr = root.formatAssetAmount(asset.amount, asset);
            asset.lockedBalanceStr = root.formatAssetAmount(asset.lockedAmount, asset);
            asset.availableBalance = asset.amount - asset.lockedAmount;
            asset.availableBalanceStr = root.formatAssetAmount(asset.availableBalance, asset);
        });
        cb(null, assetsMap);
      }, function(err) {
        cb(err);
      });
    });
  };
  
  var _addColoredUtxoToMap = function(asset, metadata, address, network, assetsMap) {
    var groupedAsset = assetsMap[asset.assetId];
    if (!groupedAsset) {
      groupedAsset = { 
                      assetId: asset.assetId,
                      amount: 0,
                      network: network,
                      divisible: metadata.divisibility,
                      reissuable: metadata.lockStatus == false,
                      icon: _extractAssetIcon(metadata),
                      issuanceTxid: metadata.issuanceTxid,
                      metadata: metadata.metadataOfIssuence.data,
                      lockedAmount: 0,
                      utxos: []
                   };
      assetsMap[asset.assetId] = groupedAsset;
    }
    var isLocked = lodash.includes(self.lockedUtxos, asset.utxo.txid + ":" + asset.utxo.index);
    if (isLocked) {
      groupedAsset.lockedAmount += asset.amount;
    }
    lodash.assign(asset.utxo, { assetAmount: asset.amount, address: address, isLocked: isLocked })
    groupedAsset.utxos.push(asset.utxo);
    groupedAsset.amount += asset.amount;
  };
  
  var _filterSupportedAssets = function(assetsInfo) {
    var supportedAssets = lodash.pluck(self.supportedAssets, 'assetId');
    assetsInfo = lodash.reject(assetsInfo, function(i) {
      return supportedAssets.indexOf(i.assetId) == -1;
    });
    return assetsInfo;
  }

  var _getAssetsForAddress = function(address, assetsMap) {
    return $q(function(resolve, reject) {
      coluRpc.getAddressInfo(address, function(err, addressInfo) {
        if (err) { return reject(err); }

        var assetsInfo = extractAssets(addressInfo);
        $log.debug("Assets for " + address + ": " + JSON.stringify(assetsInfo));
        assetsInfo = _filterSupportedAssets(assetsInfo);
        
        var network = profileService.focusedClient.credentials.network;
        assetData = assetsInfo.map(function(asset, i) {
          return $q(function(resolve, reject) {
            coluRpc.getAssetMetadata(asset, function(err, metadata) {
              if (err) { return reject(err); }
              _addColoredUtxoToMap(asset, metadata, address, network, assetsMap);
              resolve();
            });
          });
        });

        $q.all(assetData).then(function() {
          resolve();
        }, function() {
          reject();
        });
      });
    });
  };
  
  var _selectUtxos = function(utxos, amount) {
      utxos = lodash.sortBy(utxos, 'assetAmount');
      
      // first, let's try to use single utxo with exact amount,
      // then try to use smaller utxos to collect required amount (to reduce fragmentation)
      var totalAmount = 0,
          firstUsedIndex = -1,
          changeAddress,
          selected = [];
      for (var i = utxos.length - 1; i >= 0; i--) {
        if (utxos[i].assetAmount > amount || utxos[i].isLocked) continue;
        if (firstUsedIndex < 0) { 
          firstUsedIndex = i;
        }
        totalAmount += utxos[i].assetAmount;
        selected.push(utxos[i].txid + ":" + utxos[i].index);
        if (!changeAddress) {
          changeAddress = utxos[i].address;
        }
        if (totalAmount >= amount) {
          return { utxos: selected, amount: totalAmount, changeAddress: changeAddress };
        }
      }

      // not enough smaller utxos, use the one bigger, if any
      if (firstUsedIndex < utxos.length - 1 && !utxos[firstUsedIndex + 1].isLocked) {
        return { 
          utxos: [utxos[firstUsedIndex + 1].txid + ":" + utxos[firstUsedIndex + 1].index], 
          amount: utxos[firstUsedIndex + 1].assetAmount,
          changeAddress: utxos[firstUsedIndex + 1].address
        };
      }
      
      return null;
  };

  var createTransferTx = function(asset, amount, toAddress, cb) {
    if (amount > asset.availableBalance) {
      return cb({ error: "Cannot transfer more assets then available" }, null);
    }

    var to = [{
      "address": toAddress,
      "amount": amount,
      "assetId": asset.assetId
    }];
    
    var selectedUtxos = _selectUtxos(asset.utxos, amount);
    if (!selectedUtxos) {
      return cb({ message: 'Not enough assets' });
    }

    // transfer the rest of asset back to our address
    if (amount < selectedUtxos.amount) {
      to.push({
        "address": selectedUtxos.changeAddress,
        "amount": selectedUtxos.amount - amount,
        "assetId": asset.assetId
      });
    }

    var transfer = {
      sendutxo: selectedUtxos.utxos,
      to: to,
      flags: {
        injectPreviousOutput: true
      }
    };

    coluRpc.createTx('send', transfer, cb);
  };

  root.createIssueTx = function(issuance, cb) {

    var fc = profileService.focusedClient;
    addressService.getAddress(fc.credentials.walletId, true, function(err, freshAddress) {
      if (err) { return cb(err); }

      var metadata = lodash.pick(issuance, ['assetName', 'description', 'issuer', 'urls', 'userData']);
      // convert { name: 'Color', value: 'Blue' } to { "Color" : "Blue" }
      metadata.userData = lodash.reduce(metadata.userData, function(result, field) {
        if (field.name !== '' && field.value !== '') {
          result[field.name] = field.value;
        }
        return result;
      }, {});

      var issuanceOpts = {
        divisibility: 0,
        amount: issuance.amount,
        reissueable: issuance.reissuable || false,
        transfer: [{
          'address': freshAddress,
          'amount': issuance.amount
        }],
        metadata: metadata
      };

      coluRpc.issueAsset(issuanceOpts, cb);
    });
  };
  
  var getSymbolFromConfig = function(assetId) {
    try {
      var asset = lodash.find(self.supportedAssets, function(a) {
        return a.assetId === assetId;
      });
      return { symbol: asset.symbol, pluralSymbol: asset.pluralSymbol };
    } catch (e) {
    }
    
    return null;
  };

  root.getAssetSymbol = function(assetId, asset) {
    var symbolData = getSymbolFromConfig(assetId);
    return UnitSymbol.create(symbolData) || UnitSymbol.DEFAULT;
  };

  root.formatAssetAmount = function(amount, asset, unitSymbol) {
    asset = asset || {};
    
    function formatAssetValue(value, decimalPlaces) {
      if (!value) {
        return '0';
      }
      value = (value / Math.pow(10, decimalPlaces)).toFixed(decimalPlaces);
      var x = value.split('.');
      var x0 = x[0];
      var x1 = x[1];

      x0 = x0.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return decimalPlaces > 0 ? x0 + '.' + x1 : x0;
    }
    
    if (!asset.unitSymbol) {
      asset.unitSymbol = unitSymbol || root.getAssetSymbol(asset.assetId, asset);
    }

    return formatAssetValue(amount, asset ? asset.divisible: 0) + ' ' + asset.unitSymbol.forAmount(amount);
  };
  
  root.sendTransferTxProposal = function (amount, toAddress, comment, asset, cb) {
    $log.debug("Transfering " + amount + " units(s) of asset " + asset.assetId + " to " + toAddress);

    var fc = profileService.focusedClient;
    
    createTransferTx(asset, amount, toAddress, function (err, result) {
      if (err) { 
        return cb(err.error || err);
      }

      var customData = {
        asset: {
          action: 'transfer',
          assetId: asset.assetId,
          assetName: asset.metadata.assetName,
          icon: asset.icon,
          amount: amount,
          balanceStr: root.formatAssetAmount(amount, asset)
        },
        financeTxId: result.financeTxid
      };
      sendTxProposal(result.txHex, toAddress, comment, customData, cb);
    });
  };

  var sendTxProposal = function (txHex, toAddress, comment, customData, cb) {
    var fc = profileService.focusedClient;
    var tx = new bitcore.Transaction(txHex);
    $log.debug(JSON.stringify(tx.toObject(), null, 2));

    var inputs = lodash.map(tx.inputs, function (input) {
      input = input.toObject();
      var storedInput = root.txidToUTXO[input.prevTxId + ":" + input.outputIndex]
          || root.scriptToUTXO[input.script || input.scriptPubKey];
      input.publicKeys = storedInput.publicKeys;
      input.path = storedInput.path;
      input.vout = input.vout || input.outputIndex;

      if (!input.txid) {
        input.txid = input.prevTxId;
      }
      if (!input.satoshis) {
        input.satoshis = 0;
      }
      return input;
    });

    var outputs = lodash.chain(tx.outputs)
        .map(function (o) {
          return { script: o.script.toString(), amount: o.satoshis };
        })
        .value();

    // for Copay to show recipient properly
    outputs[0].toAddress = toAddress;

    fc.sendTxProposal({
      type: 'external',
      inputs: inputs,
      outputs: outputs,
      noOutputsShuffle: true,
      message: comment,
      payProUrl: null,
      feePerKb: 43978,
      fee: 5000,
      customData: customData,
      utxosToExclude: root.getColoredUtxos()
    }, function (err, txp) {
      if (err) {
        return cb(err);
      }
      txp.changeAddress = inputs[0].address;
      return cb(null, txp);
    });
  };

  return root;
}


angular.module('copayAddon.colu').provider('coloredCoins', function() {
  
  var supportedAssets;
  
  this.setSupportedAssets = function(supportedAssets) {
    this.supportedAssets = supportedAssets;
  };
  
  this.$get = function($rootScope, profileService, addressService, coluRpc, $log,
                        $q, $timeout, lodash, configService, bitcore) {
      return new ColoredCoins($rootScope, profileService, addressService, coluRpc, $log,
                            $q, $timeout, lodash, configService, bitcore, this.supportedAssets);
  };
});

'use strict';

angular.module('copayAddon.colu')
  .provider('coluRpc', function () {

  var that = this;

  this.rpcConfig = {
    livenet: {
      rpcHost: '',      // Colu JSON RPC host
      rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth 
      rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth 
    },
    testnet: {
      rpcHost: '',      // Colu JSON RPC host
      rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth 
      rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth 
    }
  };
    
  this.configure = function(config) {
    this.rpcConfig = config;
  }

  this.$get = function(profileService, $rootScope, $log, $http) {
    var root = {};
    
    that._handleDataResponse = function(response, cb) {
      var data = response.data;
      if (data.error) {
        cb(data.error);
      } else if (data.errorMessage) {
        cb(data.errorMessage);
      } else {
        cb(null, data.result);
      }
    };

    that._handleErrorResponse = function(response, cb) {
      $log.error(response.status + ': ' + JSON.stringify(response.data));
      cb(response.status == 500 ? 'Server error' : response.data);
    };

    var withLog = function(cb) {
      return function(err, body) {
        var errStr = err ? JSON.stringify(err) : err;
        var bodyStr = body ? JSON.stringify(body).substring(0, 3000) + ".." : body;
        $log.debug("Colu returned: [" + errStr + "] " + bodyStr);
        return cb(err, body);
      };
    };
    
    var _request = function(method, data, cb) {
      var network = profileService.focusedClient.credentials.network,
          rpcConfig = that.rpcConfig[network];
      

      if (rpcConfig.authName) {
        config.headers = {
          Authorization: 'Basic ' + $base64.encode(rpcConfig.authName + ':' + rpcConfig.authSecret)
        };
      }
      
      var request = {
        url: rpcConfig.baseUrl,
        method: 'POST',
        data: {
          method: method,
          jsonrpc: "2.0",
          id: "1",
          params: data
        }
      };
      $http(request).then(function successCallback(response) {
        that._handleDataResponse(response, withLog(cb));
      }, function errorCallback(response) {
        that._handleErrorResponse(response, withLog(cb));
      });
    };
    
    $rootScope.$on('ColoredCoins/BroadcastTxp', function(e, txp) {
      root.broadcastTx(txp.raw, txp.customData.financeTxId, function (err, body) {
        if (err) {
          return $rootScope.$emit('ColoredCoins/Broadcast:error', { name: 'ERROR', message: "Colu returns error" });
        }

        $rootScope.$emit('ColoredCoins/Broadcast:success');
      });
    });

    root.broadcastTx = function(signedTxHex, lastTxId, cb) {
      $log.debug('Broadcasting tx via Colu: ' + JSON.stringify({
        last_txid: lastTxId,
        tx_hex: signedTxHex
      }));
      var params = {
        signedTxHex: signedTxHex,
        lastTxid: lastTxId
      };  
            
      _request("transmit", params, cb);  
    };

    root.getAssetMetadata = function(asset, cb) {
      var params = {
        assetId: asset.assetId,
        utxo: asset.utxo.txid + ":" + asset.utxo.index
      };
            
      _request("getAssetMetadata", params, cb);  
    };

    root.getAddressInfo = function(address, cb) {
      _request("coloredCoins.getAddressInfo", { address: address }, cb);  
    };

    root.issueAsset = function(params, cb) {
      $log.debug("Issuing asset via Colu: " + JSON.stringify(params));
            
      _request("issueAsset", { params : params }, cb);  
    };

    root.createTx = function(type, args, cb) {
      $log.debug("Creating " + type + " asset tx via Colu: " + JSON.stringify(args));
      var params = {
        type: type,
        args: args
      };  
            
      _request("buildTransaction", params, cb);  
    };
    
    root.getTransactions = function(addresses, cb) {
      $log.debug("Getting transactions for addresses via Colu..");
      var params = {
        addresses: addresses
      };
            
      _request("getTransactions", params, cb);  
    };

    return root;
  }
  
});

'use strict';


angular.module('copayAddon.colu').factory('insight', function ($http, profileService) {

  function Insight(opts) {
    this.network = opts.network || 'livenet';
    this.url = opts.url;
  }

  Insight.prototype.getTransaction = function(txid, cb) {
    var url = this.url + '/api/tx/' + txid;

    $http.get(url)
        .success(function (data, status) {
          if (status != 200) return cb(data);
          return cb(null, data);
        })
        .error(function (data, status) {
          return cb(data);
        });
  };

  var testnetInsight = new Insight({ network: 'testnet', url: 'https://test-insight.bitpay.com' });

  var livenetInsight = new Insight({ network: 'livenet', url: 'https://insight.bitpay.com' });

  return {
    get: function() {
      var fc = profileService.focusedClient;
      return fc.credentials.network == 'testnet' ? testnetInsight : livenetInsight;
    }
  };
});

'use strict';

function UnitSymbol() {}

UnitSymbol.create = function(symbol, pluralSymbol) {
  if (!symbol) {
    return null;
  }
  
  if (symbol instanceof Object) {
    return UnitSymbol.create(symbol.symbol, symbol.pluralSymbol);
  }
  var symbolObj = new UnitSymbol();
  symbolObj.pluralSymbol = pluralSymbol || symbol;
  symbolObj.symbol = symbol;

  return symbolObj;
};

UnitSymbol.DEFAULT = UnitSymbol.create('unit', 'units');

UnitSymbol.prototype.forAmount = function(amount) {
  return amount == 1 ? this.symbol : this.pluralSymbol;
};
'use strict';

angular.module('copayAddon.colu')
    .directive('booleanIcon', function() {
      return {
        restrict: 'E',
        scope: {
          value: '='
        },
        replace: true,
        template: '<span>' +
                    '<i class="fi-check" style="color:green" ng-show="value"></i>' +
                    '<i class="fi-x" style="color:red" ng-show="!value"></i>' +
                  '</span>'
      }
    });

/*! 6.1.2 */
!window.XMLHttpRequest||window.FileAPI&&FileAPI.shouldLoad||(window.XMLHttpRequest.prototype.setRequestHeader=function(a){return function(b,c){if("__setXHR_"===b){var d=c(this);d instanceof Function&&d(this)}else a.apply(this,arguments)}}(window.XMLHttpRequest.prototype.setRequestHeader));var ngFileUpload=angular.module("ngFileUpload",[]);ngFileUpload.version="6.1.2",ngFileUpload.defaults={},ngFileUpload.service("Upload",["$http","$q","$timeout",function(a,b,c){function d(d){d.method=d.method||"POST",d.headers=d.headers||{};var e=b.defer(),f=e.promise;return d.headers.__setXHR_=function(){return function(a){a&&(d.__XHR=a,d.xhrFn&&d.xhrFn(a),a.upload.addEventListener("progress",function(a){a.config=d,e.notify?e.notify(a):f.progressFunc&&c(function(){f.progressFunc(a)})},!1),a.upload.addEventListener("load",function(a){a.lengthComputable&&(a.config=d,e.notify?e.notify(a):f.progressFunc&&c(function(){f.progressFunc(a)}))},!1))}},a(d).then(function(a){e.resolve(a)},function(a){e.reject(a)},function(a){e.notify(a)}),f.success=function(a){return f.then(function(b){a(b.data,b.status,b.headers,d)}),f},f.error=function(a){return f.then(null,function(b){a(b.data,b.status,b.headers,d)}),f},f.progress=function(a){return f.progressFunc=a,f.then(null,null,function(b){a(b)}),f},f.abort=function(){return d.__XHR&&c(function(){d.__XHR.abort()}),f},f.xhr=function(a){return d.xhrFn=function(b){return function(){b&&b.apply(f,arguments),a.apply(f,arguments)}}(d.xhrFn),f},f}this.upload=function(a){function b(c,d,e){if(void 0!==d)if(angular.isDate(d)&&(d=d.toISOString()),angular.isString(d))c.append(e,d);else if("form"===a.sendFieldsAs)if(angular.isObject(d))for(var f in d)d.hasOwnProperty(f)&&b(c,d[f],e+"["+f+"]");else c.append(e,d);else d=angular.isString(d)?d:JSON.stringify(d),"json-blob"===a.sendFieldsAs?c.append(e,new Blob([d],{type:"application/json"})):c.append(e,d)}return a.headers=a.headers||{},a.headers["Content-Type"]=void 0,a.transformRequest=a.transformRequest?angular.isArray(a.transformRequest)?a.transformRequest:[a.transformRequest]:[],a.transformRequest.push(function(c){var d,e=new FormData,f={};for(d in a.fields)a.fields.hasOwnProperty(d)&&(f[d]=a.fields[d]);c&&(f.data=c);for(d in f)if(f.hasOwnProperty(d)){var g=f[d];a.formDataAppender?a.formDataAppender(e,d,g):b(e,g,d)}if(null!=a.file){var h=a.fileFormDataName||"file";if(angular.isArray(a.file))for(var i=angular.isString(h),j=0;j<a.file.length;j++)e.append(i?h:h[j],a.file[j],a.fileName&&a.fileName[j]||a.file[j].name);else e.append(h,a.file,a.fileName||a.file.name)}return e}),d(a)},this.http=function(b){return b.transformRequest=b.transformRequest||function(b){return window.ArrayBuffer&&b instanceof window.ArrayBuffer||b instanceof Blob?b:a.defaults.transformRequest[0](arguments)},d(b)},this.dataUrl=function(a,b,d){window.FileReader&&a&&(!window.FileAPI||-1===navigator.userAgent.indexOf("MSIE 8")||a.size<2e4)&&(!window.FileAPI||-1===navigator.userAgent.indexOf("MSIE 9")||a.size<4e6)?c(function(){var e=window.URL||window.webkitURL;if(e&&e.createObjectURL&&!d)b(e.createObjectURL(a));else{var f=new FileReader;f.readAsDataURL(a),f.onload=function(a){c(function(){b(a.target.result)})}}}):b(null)},this.setDefaults=function(a){ngFileUpload.defaults=a||{}}}]),function(){function a(a,f,g,h,i,j,k){function l(){return"input"===f[0].tagName.toLowerCase()&&g.type&&"file"===g.type.toLowerCase()}function m(b){if(!s){s=!0;try{for(var k=b.__files_||b.target&&b.target.files,l=[],m=[],n=0;n<k.length;n++){var o=k.item(n);d(a,i,g,o,b)?l.push(o):m.push(o)}f.$$ngfHasFile=!0,e(i,j,a,h,g,c(g,"ngfChange")||c(g,"ngfSelect"),l,m,b),0===l.length&&(b.target.value=l)}finally{s=!1}}}function n(b){c(g,"ngfMultiple")&&b.attr("multiple",i(c(g,"ngfMultiple"))(a)),c(g,"ngfCapture")&&b.attr("capture",i(c(g,"ngfCapture"))(a)),c(g,"accept")&&b.attr("accept",c(g,"accept"));for(var d=0;d<f[0].attributes.length;d++){var e=f[0].attributes[d];(l()&&"type"!==e.name||"type"!==e.name&&"class"!==e.name&&"id"!==e.name&&"style"!==e.name)&&((null==e.value||""===e.value)&&("required"===e.name&&(e.value="required"),"multiple"===e.name&&(e.value="multiple")),b.attr(e.name,e.value))}}function o(b,c){if(!c&&(b||l()))return f.$$ngfRefElem||f;if(f.$$ngfProgramClick)return f;var d=angular.element('<input type="file">');return n(d),l()?(f.replaceWith(d),f=d,d.attr("__ngf_gen__",!0),k(f)(a)):(d.css("visibility","hidden").css("position","absolute").css("overflow","hidden").css("width","0px").css("height","0px").css("border","none").css("margin","0px").css("padding","0px").attr("tabindex","-1"),f.$$ngfRefElem&&f.$$ngfRefElem.remove(),f.$$ngfRefElem=d,document.body.appendChild(d[0])),d}function p(b){f.$$ngfHasFile&&(e(i,j,a,h,g,c(g,"ngfChange")||c(g,"ngfSelect"),[],[],b,!0),delete f.$$ngfHasFile)}function q(d){function e(a){a&&!f.$$ngfProgramClick&&(f.$$ngfProgramClick=!0,s[0].click(),j(function(){delete f.$$ngfProgramClick},500)),!l()&&a||!n||f.bind("click touchstart touchend",q)}if(f.attr("disabled")||r)return!1;if(null!=d){var h=d.changedTouches||d.originalEvent&&d.originalEvent.changedTouches;if("touchstart"===d.type)return t=h?h[0].clientY:0,!0;if(d.stopPropagation(),d.preventDefault(),"touchend"===d.type){var k=h?h[0].clientY:0;if(Math.abs(k-t)>20)return!1}}var n=i(c(g,"ngfResetOnClick"))(a)!==!1,s=o(d,n);return s&&((!d||n)&&s.bind("change",m),d&&n&&i(c(g,"ngfResetModelOnClick"))(a)!==!1&&p(d),b(navigator.userAgent)?setTimeout(function(){e(d)},0):e(d)),!1}if(!f.attr("__ngf_gen__")){a.$on("$destroy",function(){f.$$ngfRefElem&&f.$$ngfRefElem.remove()});var r=!1;-1===c(g,"ngfSelect").search(/\W+\$files\W+/)&&a.$watch(c(g,"ngfSelect"),function(a){r=a===!1});var s=!1,t=0;window.FileAPI&&window.FileAPI.ngfFixIE?window.FileAPI.ngfFixIE(f,o,n,m):q()}}function b(a){var b=a.match(/Android[^\d]*(\d+)\.(\d+)/);if(b&&b.length>2){var c=ngFileUpload.defaults.androidFixMinorVersion||4;return parseInt(b[1])<4||parseInt(b[1])===c&&parseInt(b[2])<c}return-1===a.indexOf("Chrome")&&/.*Windows.*Safari.*/.test(a)}ngFileUpload.getAttrWithDefaults=function(a,b){return null!=a[b]?a[b]:null==ngFileUpload.defaults[b]?ngFileUpload.defaults[b]:ngFileUpload.defaults[b].toString()};var c=ngFileUpload.getAttrWithDefaults;ngFileUpload.directive("ngfSelect",["$parse","$timeout","$compile",function(b,c,d){return{restrict:"AEC",require:"?ngModel",link:function(e,f,g,h){a(e,f,g,h,b,c,d)}}}]),ngFileUpload.validate=function(a,b,d,e,f){function g(a){if(a.length>2&&"/"===a[0]&&"/"===a[a.length-1])return a.substring(1,a.length-1);var b=a.split(","),c="";if(b.length>1)for(var d=0;d<b.length;d++)c+="("+g(b[d])+")",d<b.length-1&&(c+="|");else 0===a.indexOf(".")&&(a="*"+a),c="^"+a.replace(new RegExp("[.\\\\+*?\\[\\^\\]$(){}=!<>|:\\-]","g"),"\\$&")+"$",c=c.replace(/\\\*/g,".*").replace(/\\\?/g,".");return c}if(null==e)return!1;var h=b(c(d,"ngfValidate"))(a,{$file:e,$event:f});if(null!=h&&(h===!1||h.length>0))return e.$error=h?h:"validate",!1;var i=b(c(d,"ngfAccept"))(a,{$file:e,$event:f}),j=b(c(d,"ngfMaxSize"))(a,{$file:e,$event:f})||9007199254740991,k=b(c(d,"ngfMinSize"))(a,{$file:e,$event:f})||-1;if(null!=i&&angular.isString(i)){var l=new RegExp(g(i),"gi");if(i=null!=e.type&&l.test(e.type.toLowerCase())||null!=e.name&&l.test(e.name.toLowerCase()),!i)return e.$error="accept",!1}else if(i===!1)return e.$error="accept",!1;return null==e.size?!0:e.size>j?(e.$error="maxSize",!1):e.size<k?(e.$error="minSize",!1):!0},ngFileUpload.updateModel=function(a,b,d,e,f,g,h,i,j,k){function l(){var k=a(c(f,"ngfKeep"))(d);if(k===!0){var l=(e.$modelValue||[]).slice(0);if(h&&h.length)if(a(c(f,"ngfKeepDistinct"))(d)===!0){for(var m=l.length,n=0;n<h.length;n++){for(var o=0;m>o&&h[n].name!==l[o].name;o++);o===m&&l.push(h[n])}h=l}else h=l.concat(h);else h=l}var p=h&&h.length?h[0]:null;if(e){var q=!a(c(f,"ngfMultiple"))(d)&&!c(f,"multiple")&&!k;a(c(f,"ngModel")).assign(d,q?p:h),b(function(){e&&e.$setViewValue(q?p:null!=h&&0===h.length?null:h)})}var r=c(f,"ngfModel");r&&a(r).assign(d,h),c(f,"ngModelRejected")&&a(c(f,"ngModelRejected")).assign(d,i),g&&a(g)(d,{$files:h,$file:p,$rejectedFiles:i,$event:j})}k?l():b(function(){l()})};var d=ngFileUpload.validate,e=ngFileUpload.updateModel}(),function(){function a(a,f,g,h,i,j,k){function l(a,b,d){var f=!0,g=d.dataTransfer.items;if(null!=g)for(var h=0;h<g.length&&f;h++)f=f&&("file"===g[h].kind||""===g[h].kind)&&c(a,i,b,g[h],d);var j=i(e(b,"ngfDragOverClass"))(a,{$event:d});return j&&(j.delay&&(s=j.delay),j.accept&&(j=f?j.accept:j.reject)),j||e(b,"ngfDragOverClass")||"dragover"}function m(b,d,e,f){function h(d){c(a,i,g,d,b)?m.push(d):n.push(d)}function l(a,b,c){if(null!=b)if(b.isDirectory){var d=(c||"")+b.name;h({name:b.name,type:"directory",path:d});var e=b.createReader(),f=[];o++;var g=function(){e.readEntries(function(d){try{if(d.length)f=f.concat(Array.prototype.slice.call(d||[],0)),g();else{for(var e=0;e<f.length;e++)l(a,f[e],(c?c:"")+b.name+"/");o--}}catch(h){o--,console.error(h)}},function(){o--})};g()}else o++,b.file(function(a){try{o--,a.path=(c?c:"")+a.name,h(a)}catch(b){o--,console.error(b)}},function(){o--})}var m=[],n=[],o=0;if("paste"===b.type){var p=b.clipboardData||b.originalEvent.clipboardData;if(p&&p.items){for(var q=0;q<p.items.length;q++)-1!==p.items[q].type.indexOf("image")&&h(p.items[q].getAsFile());d(m,n)}}else{var r=b.dataTransfer.items;if(r&&r.length>0&&"file"!==k.protocol())for(var s=0;s<r.length;s++){if(r[s].webkitGetAsEntry&&r[s].webkitGetAsEntry()&&r[s].webkitGetAsEntry().isDirectory){var t=r[s].webkitGetAsEntry();if(t.isDirectory&&!e)continue;null!=t&&l(m,t)}else{var u=r[s].getAsFile();null!=u&&h(u)}if(!f&&m.length>0)break}else{var v=b.dataTransfer.files;if(null!=v)for(var w=0;w<v.length&&(h(v.item(w)),f||!(m.length>0));w++);}var x=0;!function y(a){j(function(){if(o)10*x++<2e4&&y(10);else{if(!f&&m.length>1){for(s=0;"directory"===m[s].type;)s++;m=[m[s]]}d(m,n)}},a||0)}()}}var n=b();if(e(g,"dropAvailable")&&j(function(){a[e(g,"dropAvailable")]?a[e(g,"dropAvailable")].value=n:a[e(g,"dropAvailable")]=n}),!n)return void(i(e(g,"ngfHideOnDropNotAvailable"))(a)===!0&&f.css("display","none"));var o=!1;-1===e(g,"ngfDrop").search(/\W+\$files\W+/)&&a.$watch(e(g,"ngfDrop"),function(a){o=a===!1});var p,q=null,r=i(e(g,"ngfStopPropagation")),s=1;f[0].addEventListener("dragover",function(b){if(!f.attr("disabled")&&!o){if(b.preventDefault(),r(a)&&b.stopPropagation(),navigator.userAgent.indexOf("Chrome")>-1){var c=b.dataTransfer.effectAllowed;b.dataTransfer.dropEffect="move"===c||"linkMove"===c?"move":"copy"}j.cancel(q),a.actualDragOverClass||(p=l(a,g,b)),f.addClass(p)}},!1),f[0].addEventListener("dragenter",function(b){f.attr("disabled")||o||(b.preventDefault(),r(a)&&b.stopPropagation())},!1),f[0].addEventListener("dragleave",function(){f.attr("disabled")||o||(q=j(function(){f.removeClass(p),p=null},s||1))},!1),f[0].addEventListener("drop",function(b){f.attr("disabled")||o||(b.preventDefault(),r(a)&&b.stopPropagation(),f.removeClass(p),p=null,m(b,function(c,f){d(i,j,a,h,g,e(g,"ngfChange")||e(g,"ngfDrop"),c,f,b)},i(e(g,"ngfAllowDir"))(a)!==!1,e(g,"multiple")||i(e(g,"ngfMultiple"))(a)))},!1),f[0].addEventListener("paste",function(b){f.attr("disabled")||o||m(b,function(c,f){d(i,j,a,h,g,e(g,"ngfChange")||e(g,"ngfDrop"),c,f,b)},!1,e(g,"multiple")||i(e(g,"ngfMultiple"))(a))},!1)}function b(){var a=document.createElement("div");return"draggable"in a&&"ondrop"in a}var c=ngFileUpload.validate,d=ngFileUpload.updateModel,e=ngFileUpload.getAttrWithDefaults;ngFileUpload.directive("ngfDrop",["$parse","$timeout","$location",function(b,c,d){return{restrict:"AEC",require:"?ngModel",link:function(e,f,g,h){a(e,f,g,h,b,c,d)}}}]),ngFileUpload.directive("ngfNoFileDrop",function(){return function(a,c){b()&&c.css("display","none")}}),ngFileUpload.directive("ngfDropAvailable",["$parse","$timeout",function(a,c){return function(d,f,g){if(b()){var h=a(e(g,"ngfDropAvailable"));c(function(){h(d),h.assign&&h.assign(d,!0)})}}}])}(),function(){function a(a,b,c,d,e,f,g){f&&g(c(f)(b)),b.$watch(e,function(e){angular.isString(e)?g(e):window.FileReader&&ngFileUpload.validate(b,c,d,e,null)&&a.dataUrl(e,function(a){g?g(a):e.dataUrl=a||c(f)(b)},c(d.ngfNoObjectUrl)(b))})}ngFileUpload.directive("ngfSrc",["$parse","Upload",function(b,c){return{restrict:"AE",link:function(d,e,f){a(c,d,b,f,f.ngfSrc,f.ngfDefaultSrc,function(a){e.attr("src",a)})}}}]),ngFileUpload.directive("ngfBackground",["$parse","Upload",function(b,c){return{restrict:"AE",link:function(d,e,f){a(c,d,b,f,f.ngfBackground,f.ngfDefaultBackground,function(a){e.css("background-image","url("+a+")")})}}}]),ngFileUpload.directive("ngfDataUrl",["$parse","Upload",function(b,c){return{restrict:"AE",link:function(d,e,f){a(c,d,b,f,f.ngfDataUrl,f.ngfDefaultDataUrl)}}}])}();