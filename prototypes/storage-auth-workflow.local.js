(() => {
  const catalog = {
    sqlprodbackup01: [
      { container: 'manual', access: true, lifecycleDays: null, softDeleteDays: 7, immutabilityDays: null },
      { container: 'scheduled', access: true, lifecycleDays: 30, softDeleteDays: 7, immutabilityDays: null },
      { container: 'restricted', access: false, lifecycleDays: 5, softDeleteDays: 7, immutabilityDays: null }
    ],
    sqlmigrationwest: [
      { container: 'migration', access: true, lifecycleDays: 14, softDeleteDays: 14, immutabilityDays: null },
      { container: 'archive', access: true, lifecycleDays: 365, softDeleteDays: 30, immutabilityDays: 90 }
    ]
  };
  const accountMetadata = {
    sqlprodbackup01: { subscription: 'Production subscription', subscriptionId: '11111111-1111-1111-1111-111111111111', resourceGroup: 'rg-sql-production' },
    sqlsharedbackup02: { subscription: 'Production subscription', subscriptionId: '11111111-1111-1111-1111-111111111111', resourceGroup: 'rg-shared-backup' },
    sqlmigrationwest: { subscription: 'Migration subscription', subscriptionId: '22222222-2222-2222-2222-222222222222', resourceGroup: 'rg-data-migration' }
  };
  catalog.sqlsharedbackup02 = [
    { container: 'database-backups', access: true, lifecycleDays: 90, softDeleteDays: 14, immutabilityDays: null }
  ];
  const query = new URLSearchParams(window.location.search);
  const primaryIdentityReady = query.get('primaryIdentity') !== 'missing';
  const validationState = query.get('state') || 'ready';
  const managedIdentitySupported = validationState !== 'version';
  const storageContributorReady = query.get('storageContributor') !== 'missing';
  const licenseType = query.get('license');
  const licenseEligible = !licenseType || ['payg', 'paid'].includes(licenseType.toLowerCase());
  const principal = document.querySelector('#picker-role-scope')?.closest('dl')?.querySelector('dd')?.textContent?.trim() || 'SQL Server resource';
  const managedIdentitySettingsUrl = 'https://portal.azure.com/#view/Microsoft_Azure_ArcCenterUX/SqlServerInstanceEntraSettingsBlade';
  const changeLicenseTypeUrl = 'https://portal.azure.com/#view/Microsoft_Azure_ArcCenterUX/SqlServerInstanceOverviewBlade';
  const storageIamUrl = 'https://portal.azure.com/#view/Microsoft_Azure_Storage/StorageMenuBlade/~/accessControl';
  const lifecycleLearnUrl = 'https://learn.microsoft.com/azure/storage/blobs/lifecycle-management-overview';
  const storageAccountsBlade = 'https://portal.azure.com/#view/HubsExtension/BrowseResource/resourceType/Microsoft.Storage%2FStorageAccounts';

  const flows = [];
  if (document.getElementById('select-backup-container')) {
    flows.push({ triggerId: 'select-backup-container', key: 'backup', actionId: 'start-backup', defaultContainer: 'manual' });
  }
  if (document.getElementById('select-policy-container')) {
    const instancePolicy = Boolean(document.getElementById('apply-policy'));
    flows.push({
      triggerId: 'select-policy-container',
      key: instancePolicy ? 'instance-policy' : 'database-policy',
      actionId: instancePolicy ? 'apply-policy' : 'apply',
      defaultContainer: 'scheduled',
      policy: true
    });
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  function containerIamUrl(accountName, containerName) {
    const metadata = accountMetadata[accountName];
    if (!metadata || !containerName) return storageIamUrl;
    const resourceId = `/subscriptions/${metadata.subscriptionId}/resourceGroups/${metadata.resourceGroup}/providers/Microsoft.Storage/storageAccounts/${accountName}/blobServices/default/containers/${containerName}`;
    return `https://portal.azure.com/#resource${resourceId}/users`;
  }

  function storageAccountContainersUrl(accountName) {
    const metadata = accountMetadata[accountName];
    if (!metadata) return storageAccountsBlade;
    const resourceId = `/subscriptions/${metadata.subscriptionId}/resourceGroups/${metadata.resourceGroup}/providers/Microsoft.Storage/storageAccounts/${accountName}`;
    return `https://portal.azure.com/#resource${resourceId}`;
  }

  function markup(flow) {
    const id = flow.key;
    const localDisabled = !licenseEligible;
    return `
      <h3>Backup destination</h3>
      <fieldset class="destination-choice">
        <legend>Destination type</legend>
        <label class="destination-option ${localDisabled ? 'disabled' : 'selected'}" id="${id}-local-option"><input type="radio" name="${id}-destination" value="local" ${localDisabled ? 'disabled' : 'checked'}><span><b>Local storage</b><small>${localDisabled ? `Unavailable with your current License Type: ${escapeHtml(licenseType)}` : 'Use the SQL Server instance\'s default backup location.'}</small></span></label>
        <label class="destination-option ${localDisabled ? 'selected' : ''}" id="${id}-blob-option"><input type="radio" name="${id}-destination" value="blob" ${localDisabled ? 'checked' : ''}><span><b>Azure Blob storage</b><small>Select or create a storage account and container.</small></span></label>
      </fieldset>
      ${localDisabled ? `<div class="banner license-info" role="alert"><i data-lucide="triangle-alert" class="icon"></i><div><b>Backup to Local storage is not available with your current License Type: ${escapeHtml(licenseType)}</b><br><a class="link" href="${changeLicenseTypeUrl}" target="_top">Change license type</a></div></div>` : ''}
      <div id="${id}-local"><div class="field"><label>Backup location</label><div class="readonly"><b>Instance default backup location</b><br><span class="muted">Resolved from SQL Server when the backup runs.</span></div></div></div>
      <div class="blob-destination" id="${id}-blob" hidden>
        <div class="field"><label for="${id}-subscription">Subscription</label><select id="${id}-subscription"><option>Production subscription</option><option>Migration subscription</option></select></div>
        <div class="field"><label for="${id}-resource-group">Resource group <span class="muted">(optional)</span></label><select id="${id}-resource-group"><option value="">All resource groups</option></select></div>
        <div class="field embedded-storage-field"><label for="${id}-account">Storage account <span aria-hidden="true">*</span></label><select id="${id}-account"></select><a class="resource-workflow-link" id="${id}-create-account" href="${storageAccountsBlade}" target="_top">Create a storage account</a><div class="field-help"><span class="muted">Creating a storage account can take a few minutes and happens on the Storage accounts page. Create one there, then return and refresh this list.${storageContributorReady ? '' : ' Storage Account Contributor access is required to create one.'}</span>${storageContributorReady ? '' : ` <a href="${storageIamUrl}" target="_top">Open Access control (IAM)</a>`}</div></div>
        <div class="field embedded-storage-field embedded-container-field"><label for="${id}-container">Container <span aria-hidden="true">*</span></label><select id="${id}-container"></select><a class="resource-workflow-link" id="${id}-create-container" href="${storageAccountsBlade}" target="_top">Create a container</a><div class="field-help"><span class="muted">Create a container from the selected storage account's Containers page, then return and refresh this list.</span></div></div>
        <div class="banner blob-retention-info"><i data-lucide="archive" class="icon"></i><div><b>Manage retention in Azure Storage.</b><br><span>Configure lifecycle rules on the storage account to meet your retention requirements. <a href="${lifecycleLearnUrl}" target="_blank" rel="noreferrer">Learn more</a></span></div></div>
        <h3 class="embedded-section-title">Authentication</h3>
        <div class="embedded-auth-grid"><div class="embedded-auth-label">Method</div><div class="embedded-auth-value">Managed identity (outbound)</div>${primaryIdentityReady && managedIdentitySupported ? `<div class="embedded-auth-label">Identity</div><div><div class="embedded-auth-identity"><span>${escapeHtml(principal)}</span><span class="muted">System assigned</span></div><div class="embedded-auth-note"><i data-lucide="info" class="icon"></i><span>SQL Server uses this Arc server identity to connect to Azure Blob storage.</span></div></div>` : ''}</div>
        <div class="check embedded-identity-status ${primaryIdentityReady && managedIdentitySupported ? '' : 'error'}" ${primaryIdentityReady && managedIdentitySupported ? '' : 'role="alert"'}><i data-lucide="${primaryIdentityReady && managedIdentitySupported ? 'circle-check' : 'circle-x'}" class="icon ${primaryIdentityReady && managedIdentitySupported ? 'ok' : ''}"></i><div><b>${!managedIdentitySupported ? 'Managed identity backup is not supported' : primaryIdentityReady ? 'Managed identity ready' : 'Primary managed identity is not configured'}</b><br><span class="muted">${!managedIdentitySupported ? 'Backup to Azure Blob storage with managed identity requires SQL Server 2025 or later on Windows.' : primaryIdentityReady ? 'Configured as this SQL Server instance\'s primary managed identity.' : 'A primary managed identity is required to back up to Azure Blob storage.'}</span></div><div class="identity-remediation-actions" ${primaryIdentityReady || !managedIdentitySupported ? 'hidden' : ''}><a class="link" href="${managedIdentitySettingsUrl}" target="_top">Configure managed identity</a><a class="link" href="https://learn.microsoft.com/sql/sql-server/azure-arc/microsoft-entra-authentication-with-managed-identity" target="_blank" rel="noreferrer">Learn more</a></div></div>
        <div class="check embedded-access-status" id="${id}-access"><i data-lucide="loader-circle" class="icon"></i><div><b id="${id}-access-title">Validating role assignment</b><br><span class="muted" id="${id}-access-message">Checking for Storage Blob Data Contributor at the selected container or an inherited parent scope.</span></div><a class="link iam-remediation" id="${id}-iam-link" href="${storageIamUrl}" target="_top" hidden>Configure IAM role</a></div>
      </div>
      ${flow.key === 'backup' ? '<div class="banner error validation-error" id="backup-destination-error" role="alert"><i data-lucide="circle-x" class="icon"></i><div><b class="validation-title"></b><br><span class="validation-message"></span></div></div><div class="banner error submission-error" id="submission-error" role="alert"><i data-lucide="circle-x" class="icon"></i><div><b>The backup request could not be submitted.</b><br><span>The service returned a transient error. No backup was started.</span></div></div>' : ''}`;
  }

  function mount(flow) {
    const trigger = document.getElementById(flow.triggerId);
    if (!trigger) return;
    const section = trigger.closest('.section');
    const authenticationSection = section.nextElementSibling;
    if (flow.policy && authenticationSection?.querySelector('h3')?.textContent.trim() === 'Authentication') {
      authenticationSection.remove();
    }
    const retentionSection = flow.policy && section.nextElementSibling?.querySelector('h3')?.textContent.trim() === 'Retention'
      ? section.nextElementSibling
      : null;
    section.innerHTML = markup(flow);
    const id = flow.key;
    const subscription = document.getElementById(`${id}-subscription`);
    const resourceGroup = document.getElementById(`${id}-resource-group`);
    const account = document.getElementById(`${id}-account`);
    const container = document.getElementById(`${id}-container`);
    let blobReady = false;

    function selectedType() {
      return section.querySelector(`input[name="${id}-destination"]:checked`).value;
    }

    function syncAction() {
      const action = document.getElementById(flow.actionId);
      if (!action) return;
      const destinationBlocked = selectedType() === 'blob' && !blobReady;
      action.dataset.destinationBlocked = String(destinationBlocked);
      action.disabled = action.dataset.pageBlocked === 'true' || destinationBlocked;
    }

    function renderRetention() {
      if (!retentionSection) return;
      const blob = selectedType() === 'blob';
      retentionSection.hidden = blob;
      const retentionInput = retentionSection.querySelector('input[type="number"]');
      const scheduleSection = [...section.parentElement.querySelectorAll('.section')]
        .find(candidate => candidate.classList.contains('backup-schedule-section'));
      const scheduleDisabled = !blob && Number(retentionInput?.value) === 0;
      scheduleSection?.querySelectorAll('select').forEach(control => { control.disabled = scheduleDisabled; });
      scheduleSection?.classList.toggle('schedule-disabled', scheduleDisabled);
    }

    function validate() {
      const item = catalog[account.value]?.find(entry => entry.container === container.value);
      const hasAccess = Boolean(item?.access);
      const accessDenied = validationState === 'access' || !hasAccess;
      const identityReady = primaryIdentityReady && managedIdentitySupported;
      blobReady = identityReady && !accessDenied;
      document.getElementById(`${id}-access-title`).textContent = !identityReady ? 'Role assignment validation pending' : hasAccess && !accessDenied ? 'Storage access role verified' : 'Storage access role not found';
      document.getElementById(`${id}-access-message`).textContent = !identityReady ? 'Resolve the managed identity requirement before validating its role assignment.' : hasAccess && !accessDenied ? `${principal} has Storage Blob Data Contributor at the selected container or an inherited parent scope.` : `${principal} does not have Storage Blob Data Contributor at the selected container or an inherited parent scope.`;
      const status = document.getElementById(`${id}-access`);
      status.querySelector('.icon')?.remove();
      status.insertAdjacentHTML('afterbegin', `<i data-lucide="${!identityReady ? 'clock-3' : blobReady ? 'circle-check' : 'circle-x'}" class="icon ${blobReady ? 'ok' : ''}"></i>`);
      const iamLink = document.getElementById(`${id}-iam-link`);
      iamLink.href = containerIamUrl(account.value, container.value);
      iamLink.hidden = !identityReady || !accessDenied;
      renderRetention();
      syncAction();
      lucide.createIcons();
    }

    function renderContainers(preferred) {
      const entries = catalog[account.value] || [];
      container.innerHTML = entries.length ? entries.map(item => `<option value="${item.container}">${item.container}</option>`).join('') : '<option value="">No containers available</option>';
      if (preferred && entries.some(item => item.container === preferred)) container.value = preferred;
      container.disabled = entries.length === 0;
      const createContainerLink = document.getElementById(`${id}-create-container`);
      createContainerLink.hidden = account.value === '__empty__';
      createContainerLink.href = storageAccountContainersUrl(account.value);
      validate();
    }

    function renderAccounts(preferred) {
      const names = Object.entries(accountMetadata)
        .filter(([, metadata]) => metadata.subscription === subscription.value && (!resourceGroup.value || metadata.resourceGroup === resourceGroup.value))
        .map(([name]) => name);
      account.innerHTML = names.length
        ? names.map(name => `<option value="${name}">${name}</option>`).join('')
        : '<option value="">No storage accounts available</option>';
      account.disabled = names.length === 0;
      if (preferred && names.includes(preferred)) account.value = preferred;
      renderContainers();
    }

    function renderResourceGroups(preferredAccount) {
      const groups = [...new Set(Object.values(accountMetadata)
        .filter(metadata => metadata.subscription === subscription.value)
        .map(metadata => metadata.resourceGroup))].sort();
      resourceGroup.innerHTML = '<option value="">All resource groups</option>' + groups.map(group => `<option value="${group}">${group}</option>`).join('');
      renderAccounts(preferredAccount);
    }

    function syncType() {
      const blob = selectedType() === 'blob';
      document.getElementById(`${id}-local`).hidden = blob;
      document.getElementById(`${id}-blob`).hidden = !blob;
      document.getElementById(`${id}-local-option`).classList.toggle('selected', !blob);
      document.getElementById(`${id}-blob-option`).classList.toggle('selected', blob);
      renderRetention();
      syncAction();
      lucide.createIcons();
    }

    section.querySelectorAll(`input[name="${id}-destination"]`).forEach(input => input.addEventListener('change', syncType));
    subscription.addEventListener('change', () => renderResourceGroups());
    resourceGroup.addEventListener('change', () => renderAccounts());
    account.addEventListener('change', () => renderContainers());
    container.addEventListener('change', validate);

    retentionSection?.querySelectorAll('input').forEach(input => input.addEventListener('input', renderRetention));

    renderResourceGroups();
    renderContainers(flow.defaultContainer);
    if (['access', 'network', 'version'].includes(validationState) || !licenseEligible) {
      section.querySelector(`input[name="${id}-destination"][value="blob"]`).checked = true;
    }
    syncType();
  }

  flows.forEach(mount);
  lucide.createIcons();
})();
