/**
 * Licensed to The Apereo Foundation under one or more contributor license
 * agreements. See the NOTICE file distributed with this work for additional
 * information regarding copyright ownership.
 *
 *
 * The Apereo Foundation licenses this file to you under the Educational
 * Community License, Version 2.0 (the "License"); you may not use this file
 * except in compliance with the License. You may obtain a copy of the License
 * at:
 *
 *   http://opensource.org/licenses/ecl2.txt
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.  See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 */
'use strict';

// Controller for all single series screens.
angular.module('adminNg.controllers')
.controller('SerieCtrl', ['$scope', 'SeriesMetadataResource', 'SeriesEventsResource', 'SeriesAccessResource',
  'SeriesThemeResource', 'SeriesTobiraResource', 'ResourcesListResource', 'RolesResource', 'Notifications',
  'AuthService', 'StatisticsReusable', '$http', 'Modal', '$translate',
  function ($scope, SeriesMetadataResource, SeriesEventsResource, SeriesAccessResource, SeriesThemeResource,
    SeriesTobiraResource, ResourcesListResource, RolesResource, Notifications, AuthService, StatisticsReusable, $http,
    Modal, $translate) {

    var metadataChangedFns = {}, aclNotification,
        me = this,
        NOTIFICATION_CONTEXT = 'series-acl',
        mainCatalog = 'dublincore/series', fetchChildResources,
        createPolicy = function (role) {
          return {
            role  : role,
            read  : false,
            write : false,
            actions : {
              name : 'series-acl-actions',
              value : []
            }
          };
        },
        changePolicies = function (access, loading) {
          var newPolicies = {};
          angular.forEach(access, function (acl) {
            var policy = newPolicies[acl.role];

            if (angular.isUndefined(policy)) {
              newPolicies[acl.role] = createPolicy(acl.role);
            }
            if (acl.action === 'read' || acl.action === 'write') {
              newPolicies[acl.role][acl.action] = acl.allow;
            } else if (acl.allow === true || acl.allow === 'true') {
              newPolicies[acl.role].actions.value.push(acl.action);
            }
          });

          $scope.policies = [];
          angular.forEach(newPolicies, function (policy) {
            $scope.policies.push(policy);
          });

          if (loading) {
            $scope.validAcl = true;
          }
        };

    $scope.aclLocked = false,
    $scope.policies = [];
    $scope.baseAcl = {};

    AuthService.getUser().$promise.then(function (user) {
      var mode = user.org.properties['admin.series.acl.event.update.mode'];
      if (['always', 'never', 'optional'].indexOf(mode) < 0) {
        mode = 'optional'; // defaults to optional
      }
      $scope.updateMode = mode;
    }).catch(angular.noop);

    $scope.changeBaseAcl = function () {
      $scope.baseAcl = SeriesAccessResource.getManagedAcl({id: this.baseAclId}, function () {
        changePolicies($scope.baseAcl.acl.ace);
      });
      this.baseAclId = '';
    };

    $scope.addPolicy = function () {
      $scope.policies.push(createPolicy());
      $scope.validAcl = false;
    };

    $scope.deletePolicy = function (policyToDelete) {
      var index;

      angular.forEach($scope.policies, function (policy, idx) {
        if (policy.role === policyToDelete.role &&
                policy.write === policyToDelete.write &&
                policy.read === policyToDelete.read) {
          index = idx;
        }
      });

      if (angular.isDefined(index)) {
        $scope.policies.splice(index, 1);
      }
    };

    $scope.getMatchingRoles = function (value) {
      RolesResource.queryNameOnly({query: value, target: 'ACL'}).$promise.then(function (data) {
        angular.forEach(data, function(newRole) {
          if ($scope.roles.indexOf(newRole) == -1) {
            $scope.roles.unshift(newRole);
          }
        });
      });
    };

    fetchChildResources = function (id) {
      var previousProviderData;
      if ($scope.statReusable !== null) {
        previousProviderData = $scope.statReusable.statProviderData;
      }
      $scope.statReusable = StatisticsReusable.createReusableStatistics(
        'series',
        id,
        previousProviderData);

      $scope.metadata = SeriesMetadataResource.get({ id: id }, function (metadata) {
        $scope.extendedMetadataCatalogs = [];
        angular.forEach(metadata.entries, function (catalog, index) {
          // common metadata
          if (catalog.flavor === mainCatalog) {
            $scope.commonMetadataCatalog = catalog;
          // extended metadata
          } else {
            $scope.extendedMetadataCatalogs.push(catalog);
          }

          // hook up tab index
          var tabindex = 2;
          angular.forEach(catalog.fields, function (entry) {
            entry.tabindex = tabindex++;

            // find title
            if (catalog.flavor === mainCatalog && entry.id === 'title' && angular.isString(entry.value)) {
              $scope.titleParams = { resourceId: entry.value.substring(0,70) };
            }

            // metadata locked?
            if (entry.locked) {
              metadata.locked = entry.locked;
            }

            // save original values
            if (entry.value instanceof Array) {
              entry.oldValue = entry.value.slice(0);
            } else {
              entry.oldValue = entry.value;
            }
          });
        });

        $http.get('/admin-ng/feeds/feeds')
        .then( function(response) {
          $scope.feedContent = response.data;
          for (var i = 0; i < $scope.commonMetadataCatalog.fields.length; i++) {
            if($scope.commonMetadataCatalog.fields[i].id === 'identifier'){
              $scope.uid = $scope.commonMetadataCatalog.fields[i].value;
            }
          }
          for (var j = 0; j < response.data.length; j++) {
            if(response.data[j].name === 'Series') {
              var pattern = response.data[j].identifier.split('/series')[0] + response.data[j].pattern;
              var uidLink = pattern.split('<series_id>')[0] + $scope.uid;
              var typeLink = uidLink.split('<type>');
              var versionLink = typeLink[1].split('<version>');
              $scope.feedsLinks = [
                {
                  type: 'atom',
                  version: '0.3',
                  link: typeLink[0] + 'atom' + versionLink[0] + '0.3' + versionLink[1]
                },
                {
                  type: 'atom',
                  version: '1.0',
                  link: typeLink[0] + 'atom' + versionLink[0] + '1.0' + versionLink[1]
                },
                {
                  type: 'rss',
                  version: '2.0',
                  link: typeLink[0] + 'rss' + versionLink[0] + '2.0' + versionLink[1]
                }
              ];
            }
          }

        }).catch(function(error) {
          $scope.feedContent = null;
        });

      });

      $scope.acls  = ResourcesListResource.get({ resource: 'ACL' });
      $scope.actions = {};
      $scope.hasActions = false;
      ResourcesListResource.get({ resource: 'ACL.ACTIONS' }, function(data) {
        angular.forEach(data, function (value, key) {
          if (key.charAt(0) !== '$') {
            $scope.actions[key] = value;
            $scope.hasActions = true;
          }
        });
      });
      $scope.aclLocked = false,

      $scope.selectedTheme = {};

      $scope.updateSelectedThemeDescripton = function () {
        if(angular.isDefined($scope.themeDescriptions)) {
          $scope.selectedTheme.description = $scope.themeDescriptions[$scope.selectedTheme.id];
        }
      };

      ResourcesListResource.get({ resource: 'THEMES.NAME' }, function (data) {
        $scope.themes = data;

        //after themes have been loaded we match the current selected
        SeriesThemeResource.get({ id: id }, function (response) {

          //we want to get rid of $resolved, etc. - therefore we use toJSON()
          angular.forEach(data.toJSON(), function (value, key) {

            if (angular.isDefined(response[key])) {
              $scope.selectedTheme.id = key;
              return false;
            }
          });

          ResourcesListResource.get({ resource: 'THEMES.DESCRIPTION' }, function (data) {
            $scope.themeDescriptions = data;
            $scope.updateSelectedThemeDescripton();
          });
        });
      });

      Notifications.removeAll('series-tobira-details');
      SeriesTobiraResource.get({ id: id }, function (tobiraData) {
        $scope.tobiraData = tobiraData;
        $scope.directTobiraLink = tobiraData.baseURL + '/!s/:' + $scope.resourceId;
      }, function (response) {
        if (response.status === 500) {
          Notifications.add('error', 'TOBIRA_SERVER_ERROR', 'series-tobira-details', -1);
        } else if (response.status === 404) {
          Notifications.add('warning', 'TOBIRA_NOT_FOUND', 'series-tobira-details', -1);
        }

        if (response.status !== 503) {
          $scope.tobiraData = { error: true };
        }
      });
      $scope.copyTobiraDirectLink = function () {
        navigator.clipboard.writeText($scope.directTobiraLink).then(function () {
          Notifications.add('info', 'TOBIRA_COPIED_DIRECT_LINK', 'series-tobira-details', 3000);
        }, function () {
          Notifications.add('error', 'TOBIRA_FAILED_COPYING_DIRECT_LINK', 'series-tobira-details', 3000);
        });
      };

      $scope.roles = RolesResource.queryNameOnly({limit: -1, target: 'ACL'});

      $scope.access = SeriesAccessResource.get({ id: id }, function (data) {
        if (angular.isDefined(data.series_access)) {
          var json = angular.fromJson(data.series_access.acl);
          changePolicies(json.acl.ace, true);
          getCurrentPolicies();

          $scope.aclLocked = data.series_access.locked;

          if ($scope.aclLocked) {
            aclNotification = Notifications.add('warning', 'SERIES_ACL_LOCKED', 'series-acl-' + id, -1);
          } else if (aclNotification) {
            Notifications.remove(aclNotification, 'series-acl');
          }

          $scope.roles.$promise.then(function () {
            angular.forEach(data.series_access.privileges, function(value, key) {
              if ($scope.roles.indexOf(key) == -1) {
                $scope.roles.push(key);
              }
            });
          });
        }
      });
    };

    $scope.statReusable = null;

    // Generate proxy function for the save metadata function based on the given flavor
    // Do not generate it
    $scope.getMetadataChangedFunction = function (flavor) {
      var fn = metadataChangedFns[flavor];
      var catalog;

      if (angular.isUndefined(fn)) {
        angular.forEach($scope.metadata.entries, function (c) {
          if (flavor === c.flavor) {
            catalog = c;
          }
        });

        fn = function (id, callback) {
          $scope.metadataChanged(id, callback, catalog);
        };

        metadataChangedFns[flavor] = fn;
      }
      return fn;
    };

    $scope.replyToId = null; // the id of the comment to which the user wants to reply

    fetchChildResources($scope.resourceId);

    $scope.$on('change', function (event, id) {
      fetchChildResources(id);
    });

    $scope.statisticsCsvFileName = function (statsTitle) {
      var sanitizedStatsTitle = statsTitle.replace(/[^0-9a-z]/gi, '_').toLowerCase();
      return 'export_series_' + $scope.resourceId + '_' + sanitizedStatsTitle + '.csv';
    };

    $translate('CONFIRMATIONS.WARNINGS.UNSAVED_CHANGES').then(function (translation) {
      window.unloadConfirmMsg = translation;
    }).catch(angular.noop);

    var confirmUnsaved = function() {
      // eslint-disable-next-line
      return confirm(window.unloadConfirmMsg);
    };

    $scope.close = function() {
      if (($scope.unsavedChanges([$scope.commonMetadataCatalog]) === false
           && $scope.unsavedChanges($scope.extendedMetadataCatalogs) === false
           && unsavedAccessChanges() === false)
          || confirmUnsaved()) {
        Modal.$scope.close();
      }
    };

    $scope.unsavedChanges = function(catalogs) {
      if (angular.isDefined(catalogs)) {
        return catalogs.some(function(catalog) {
          if (angular.isDefined(catalog)) {
            return catalog.fields.some(function(field) {
              return field.dirty === true;
            });
          }
          return false;
        });
      }
      return false;
    };

    $scope.metadataChanged = function (id, callback, catalog) {
      // Mark the saved attribute as dirty
      angular.forEach(catalog.fields, function (entry) {
        if (entry.id === id) {
          if (differentValue(entry)) {
            entry.dirty = true;
          } else {
            entry.dirty = false;
          }
        }
      });

      if (angular.isDefined(callback)) {
        callback();
      }
    };

    var differentValue = function(entry) {
      if (!entry.value && !entry.oldValue) {
        return false;
      }

      if ((!entry.value && entry.oldValue) || (entry.value && !entry.oldValue)) {
        return true;
      }

      if (entry.value instanceof Array) {
        if (entry.value.length != entry.oldValue.length) {
          return true;
        }

        for (var i = 0; i < entry.value.length; i++) {
          if (entry.value[i] !== entry.oldValue[i]) {
            return true;
          }
        }
        return false;
      } else {
        return (entry.value !== entry.oldValue);
      }
    };

    $scope.metadataSave = function (catalogs) {
      var catalogsWithUnsavedChanges = catalogs.filter(function(catalog) {
        return catalog.fields.some(function(field) {
          return field.dirty === true;
        });
      });

      catalogsWithUnsavedChanges.forEach(function(catalog) {
        // don't send collections
        catalog.fields.forEach(function(field) {
          if (Object.prototype.hasOwnProperty.call(field, 'collection')) {
            field.collection = [];
          }
        });

        SeriesMetadataResource.save({ id: $scope.resourceId }, catalog,  function () {
          var notificationContext = catalog === $scope.commonMetadataCatalog ? 'series-metadata-common'
            : 'series-metadata-extended';
          Notifications.add('info', 'SAVED_METADATA', notificationContext, 1200);

          // Unmark entries
          angular.forEach(catalog.fields, function (entry) {
            entry.dirty = false;
            // new original value
            if (entry.value instanceof Array) {
              entry.oldValue = entry.value.slice(0);
            } else {
              entry.oldValue = entry.value;
            }
          });
        });
      });
    };

    $scope.accessSave = function (override) {
      var ace = [],
          hasRights = false,
          rulesValid = false;

      $scope.validAcl = false;
      override = override === true || $scope.updateMode === 'always';

      angular.forEach($scope.policies, function (policy) {
        rulesValid = false;

        if (policy.read && policy.write) {
          hasRights = true;
        }

        if ((policy.read || policy.write || policy.actions.value.length > 0) && !angular.isUndefined(policy.role)) {
          rulesValid = true;

          if (policy.read) {
            ace.push({
              'action' : 'read',
              'allow'  : policy.read,
              'role'   : policy.role
            });
          }

          if (policy.write) {
            ace.push({
              'action' : 'write',
              'allow'  : policy.write,
              'role'   : policy.role
            });
          }

          angular.forEach(policy.actions.value, function(customAction) {
            ace.push({
              'action' : customAction,
              'allow'  : true,
              'role'   : policy.role
            });
          });
        }
      });

      $scope.validAcl = rulesValid;
      me.unvalidRule = !rulesValid;
      me.hasRights = hasRights;

      if (me.unvalidRule) {
        if (!angular.isUndefined(me.notificationRules)) {
          Notifications.remove(me.notificationRules, NOTIFICATION_CONTEXT);
        }
        me.notificationRules = Notifications.add('warning', 'INVALID_ACL_RULES', NOTIFICATION_CONTEXT);
      } else if (!angular.isUndefined(me.notificationRules)) {
        Notifications.remove(me.notificationRules, NOTIFICATION_CONTEXT);
        me.notificationRules = undefined;
      }

      if (!me.hasRights) {
        if (!angular.isUndefined(me.notificationRights)) {
          Notifications.remove(me.notificationRights, NOTIFICATION_CONTEXT);
        }
        me.notificationRights = Notifications.add('warning', 'MISSING_ACL_RULES', NOTIFICATION_CONTEXT);
      } else if (!angular.isUndefined(me.notificationRights)) {
        Notifications.remove(me.notificationRights, NOTIFICATION_CONTEXT);
        me.notificationRights = undefined;
      }

      return { ace, hasRights, rulesValid, override };
    };

    let oldPolicies = {};

    function getCurrentPolicies () {
      oldPolicies = JSON.parse(JSON.stringify($scope.policies));
    }

    $scope.saveChanges = function (override) {
      var access = $scope.accessSave(override);

      var ace = access.ace;
      var hasRights = access.hasRights;
      var rulesValid = access.rulesValid;

      if (hasRights && rulesValid) {
        SeriesAccessResource.save({ id: $scope.resourceId }, {
          acl: {
            ace: ace
          },
          override: false
        });

        Notifications.add('info', 'SAVED_ACL_RULES', NOTIFICATION_CONTEXT, 1200);
      }
      getCurrentPolicies();
    };

    $scope.updateEventPermissions = function (override) {
      var access = $scope.accessSave(override);

      var ace = access.ace;
      var hasRights = access.hasRights;
      var rulesValid = access.rulesValid;
      override = access.override;

      if (hasRights && rulesValid) {
        SeriesAccessResource.save({ id: $scope.resourceId }, {
          acl: {
            ace: ace
          },
          override: override
        });

        Notifications.add('info', 'SAVED_ACL_RULES', NOTIFICATION_CONTEXT, 1200);
      }
      getCurrentPolicies();
    };

    function unsavedAccessChanges () {
      let hasChanges = false;

      if (oldPolicies.length !== $scope.policies.length) {
        hasChanges = true;
        return hasChanges;
      }

      oldPolicies.forEach((oldPolicy, index) => {
        const policy = $scope.policies[index];

        if(oldPolicy.role !== policy.role) {
          hasChanges = true;
        }
        else if (oldPolicy.read !== policy.read) {
          hasChanges = true;
        }
        else if (oldPolicy.write !== policy.write) {
          hasChanges = true;
        }

        if (oldPolicy.actions.value.length !== policy.actions.value.length) {
          hasChanges = true;
          return;
        }
        oldPolicy.actions.value.forEach((oldAction, index) => {
          const action = policy.actions.value[index];
          if (oldAction !== action) {
            hasChanges = true;
          }
        });
      });
      return hasChanges;
    }

    $scope.themeSave = function () {
      var selectedThemeID = $scope.selectedTheme.id;
      $scope.updateSelectedThemeDescripton();

      if (angular.isUndefined(selectedThemeID) || selectedThemeID === null) {
        SeriesThemeResource.delete({ id: $scope.resourceId }, { theme: selectedThemeID }, function () {
          Notifications.add('warning', 'SERIES_THEME_REPROCESS_EXISTING_EVENTS', 'series-theme');
        });
      } else {
        SeriesThemeResource.save({ id: $scope.resourceId }, { theme: selectedThemeID }, function () {
          Notifications.add('warning', 'SERIES_THEME_REPROCESS_EXISTING_EVENTS', 'series-theme');
        });
      }
    };

    var POLICIES_LOAD_STEP = 50;
    $scope.limit = POLICIES_LOAD_STEP;
    $scope.loadmore = function () {
      $scope.limit += POLICIES_LOAD_STEP;
    };

  }]);
