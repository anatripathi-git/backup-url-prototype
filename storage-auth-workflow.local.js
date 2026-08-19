(() => {
  const catalog = {
    sqlprodbackup01: [
      { container: 'manual', access: true },
      { container: 'scheduled', access: true },
      { container: 'restricted', access: false }
    ],
    sqlmigrationwest: [
      { container: 'migration', access: true },
      { container: 'archive', access: true }
    ]
  };
  const query = new URLSearchParams(window.location.search);
  const primaryIdentityReady = query.get('primaryIdentity') !== 'missing';
  const validationState = query.get('state') || 'ready';
  const principal = document.querySelector('#picker-role-scope')?.closest('dl')?.querySelector('dd')?.textContent?.trim() || 'SQL Server resource';

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
      reviewDestinationId: instancePolicy ? 'policy-review-destination' : 'review-destination',
      reviewAuthenticationId: instancePolicy ? 'policy-review-authentication' : 'review-authentication',
      defaultContainer: 'scheduled',
      policy: true
    });
  }

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = value;
    return element.innerHTML;
  }

  function markup(flow) {
    const id = flow.key;
    return `
      <h3>Backup destination</h3>
      <fieldset class="destination-choice">
        <legend>Destination type</legend>
        <label class="destination-option selected" id="${id}-local-option"><input type="radio" name="${id}-destination" value="local" checked><span><b>Local storage</b><small>Use the SQL Server instance's default backup location.</small></span></label>
        <label class="destination-option" id="${id}-blob-option"><input type="radio" name="${id}-destination" value="blob"><span><b>Azure Blob storage</b><small>Select or create a storage account and container.</small></span></label>
      </fieldset>
      <div id="${id}-local"><div class="field"><label>Backup location</label><div class="readonly"><b>Instance default backup location</b><br><span class="muted">Resolved from SQL Server when the backup runs.</span></div></div></div>
      <div class="blob-destination" id="${id}-blob" hidden>
        <div class="banner"><i data-lucide="info" class="icon"></i><div>Managed-identity backup to Azure Blob storage is supported for <b>SQL Server 2025 or later on Windows</b>.</div></div>
        <div class="field"><label for="${id}-subscription">Subscription</label><select id="${id}-subscription"><option>Production subscription</option><option>Migration subscription</option></select></div>
        <div class="field embedded-storage-field"><label for="${id}-account">Storage account <span aria-hidden="true">*</span></label><select id="${id}-account"><option value="sqlprodbackup01">sqlprodbackup01</option><option value="sqlmigrationwest">sqlmigrationwest</option><option value="__empty__">No storage accounts available</option></select><button class="resource-workflow-link" id="${id}-create-account" type="button">Create new</button><div class="inline-create-popover" id="${id}-account-form" role="dialog" hidden><h4>Create a new storage account</h4><div class="field"><label for="${id}-account-name">Name <span aria-hidden="true">*</span></label><input id="${id}-account-name" maxlength="24"></div><div class="field"><label for="${id}-account-region">Region</label><select id="${id}-account-region"><option>(US) West US 2</option><option>(US) East US 2</option></select></div><div class="inline-create-summary"><b>Storage (General Purpose V2)</b><br><span class="muted">Locally-redundant storage (LRS)</span></div><div class="inline-create-actions"><button class="button primary" id="${id}-save-account" type="button" disabled>Create</button><button class="button" id="${id}-cancel-account" type="button">Cancel</button></div></div></div>
        <div class="field embedded-storage-field embedded-container-field"><label for="${id}-container">Container <span aria-hidden="true">*</span></label><select id="${id}-container"></select><button class="resource-workflow-link" id="${id}-create-container" type="button">Create new</button><div class="inline-create-popover" id="${id}-container-form" role="dialog" hidden><h4>Create a new container</h4><div class="field"><label for="${id}-container-name">Name <span aria-hidden="true">*</span></label><input id="${id}-container-name"></div><div class="inline-create-actions"><button class="button primary" id="${id}-save-container" type="button" disabled>Create</button><button class="button" id="${id}-cancel-container" type="button">Cancel</button></div></div></div>
        <h3 class="embedded-section-title">Authentication</h3>
        <div class="embedded-auth-grid"><div class="embedded-auth-label">Method</div><div class="embedded-auth-value">Managed identity (outbound)</div><div class="embedded-auth-label">Identity</div><div><div class="embedded-auth-identity"><span>${escapeHtml(principal)}</span><span class="muted">System assigned</span></div><div class="embedded-auth-note"><i data-lucide="info" class="icon"></i><span>SQL Server uses this Arc server identity to connect to Azure Blob storage.</span></div></div></div>
        <div class="check embedded-identity-status"><i data-lucide="${primaryIdentityReady ? 'circle-check' : 'circle-x'}" class="icon ${primaryIdentityReady ? 'ok' : ''}"></i><div><b>${primaryIdentityReady ? 'Managed identity ready' : 'Managed identity setup required'}</b><br><span class="muted">${primaryIdentityReady ? 'Configured as this SQL Server instance\'s primary managed identity.' : 'Configure the Arc server identity as this SQL Server instance\'s primary managed identity.'}</span></div><a class="link" href="https://portal.azure.com" target="_blank" rel="noreferrer" ${primaryIdentityReady ? 'hidden' : ''}>Set up managed identity</a></div>
        <div class="check embedded-access-status" id="${id}-access"><i data-lucide="loader-circle" class="icon"></i><div><b id="${id}-access-title">Validating access</b><br><span class="muted" id="${id}-access-message">Checking whether SQL Server can write to the selected container.</span></div><a class="link" id="${id}-iam" href="https://portal.azure.com" target="_blank" rel="noreferrer" hidden>Open container IAM</a></div>
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
    section.innerHTML = markup(flow);
    const id = flow.key;
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

    function validate() {
      const item = catalog[account.value]?.find(entry => entry.container === container.value);
      const hasAccess = Boolean(item?.access);
      const stateContent = {
        access: ['Storage data access is missing', `Grant Storage Blob Data Contributor to ${principal} on the selected container or a parent scope.`],
        propagation: ['Role assignment is not effective yet', 'Role changes can take up to 10 minutes. Wait, then try again.'],
        network: ['Azure Blob storage is unreachable', 'Check the storage firewall, private endpoint, DNS, and outbound HTTPS connectivity.'],
        credential: ['Managed identity authentication could not be prepared', 'Verify the SQL Server primary managed identity configuration, then try again.'],
        version: ['Azure Blob storage is unavailable for this SQL version', 'Managed-identity backup to Blob requires SQL Server 2025 or later on Windows.']
      };
      const simulatedFailure = stateContent[validationState];
      const accessDenied = validationState === 'access' || !hasAccess;
      blobReady = primaryIdentityReady && !accessDenied && !simulatedFailure;
      document.getElementById(`${id}-access-title`).textContent = simulatedFailure?.[0] || (hasAccess ? 'Authentication and access verified' : 'Storage data access is missing');
      document.getElementById(`${id}-access-message`).textContent = simulatedFailure?.[1] || (hasAccess ? 'SQL Server can write to the selected container.' : `Grant Storage Blob Data Contributor to ${principal} on the selected container or a parent scope.`);
      document.getElementById(`${id}-iam`).hidden = !primaryIdentityReady || !accessDenied || Boolean(simulatedFailure && validationState !== 'access');
      const status = document.getElementById(`${id}-access`);
      status.hidden = !primaryIdentityReady;
      status.querySelector('.icon')?.remove();
      status.insertAdjacentHTML('afterbegin', `<i data-lucide="${blobReady ? 'circle-check' : 'circle-x'}" class="icon ${blobReady ? 'ok' : ''}"></i>`);
      if (flow.reviewDestinationId) {
        document.getElementById(flow.reviewDestinationId).textContent = `${account.value} / ${container.value}`;
      }
      syncAction();
      lucide.createIcons();
    }

    function renderContainers(preferred) {
      const entries = catalog[account.value] || [];
      container.innerHTML = entries.length ? entries.map(item => `<option value="${item.container}">${item.container}</option>`).join('') : '<option value="">No containers available</option>';
      if (preferred && entries.some(item => item.container === preferred)) container.value = preferred;
      container.disabled = entries.length === 0;
      document.getElementById(`${id}-create-container`).disabled = account.value === '__empty__';
      validate();
    }

    function syncType() {
      const blob = selectedType() === 'blob';
      document.getElementById(`${id}-local`).hidden = blob;
      document.getElementById(`${id}-blob`).hidden = !blob;
      document.getElementById(`${id}-local-option`).classList.toggle('selected', !blob);
      document.getElementById(`${id}-blob-option`).classList.toggle('selected', blob);
      if (flow.reviewDestinationId) {
        document.getElementById(flow.reviewDestinationId).textContent = blob ? `${account.value} / ${container.value}` : 'Instance default backup location';
      }
      if (flow.reviewAuthenticationId) {
        document.getElementById(flow.reviewAuthenticationId).textContent = blob ? `Managed identity · ${principal}` : 'Not required for local storage';
      }
      syncAction();
      lucide.createIcons();
    }

    function showForm(name, show) {
      [`${id}-account-form`, `${id}-container-form`].forEach(formId => {
        if (formId !== name) document.getElementById(formId).hidden = true;
      });
      document.getElementById(name).hidden = !show;
      if (show) document.getElementById(name).querySelector('input')?.focus();
    }

    section.querySelectorAll(`input[name="${id}-destination"]`).forEach(input => input.addEventListener('change', syncType));
    document.getElementById(`${id}-subscription`).addEventListener('change', event => { account.value = event.target.value === 'Migration subscription' ? 'sqlmigrationwest' : 'sqlprodbackup01'; renderContainers(); });
    account.addEventListener('change', () => renderContainers());
    container.addEventListener('change', validate);
    document.getElementById(`${id}-create-account`).addEventListener('click', () => showForm(`${id}-account-form`, true));
    document.getElementById(`${id}-cancel-account`).addEventListener('click', () => showForm(`${id}-account-form`, false));
    document.getElementById(`${id}-account-name`).addEventListener('input', event => { document.getElementById(`${id}-save-account`).disabled = !/^[a-z0-9]{3,24}$/.test(event.target.value.trim()); });
    document.getElementById(`${id}-save-account`).addEventListener('click', () => {
      const name = document.getElementById(`${id}-account-name`).value.trim();
      if (!/^[a-z0-9]{3,24}$/.test(name)) return;
      catalog[name] = [];
      account.insertBefore(new Option(name, name), account.querySelector('[value="__empty__"]'));
      account.value = name;
      showForm(`${id}-account-form`, false);
      renderContainers();
      showForm(`${id}-container-form`, true);
    });
    document.getElementById(`${id}-create-container`).addEventListener('click', () => showForm(`${id}-container-form`, true));
    document.getElementById(`${id}-cancel-container`).addEventListener('click', () => showForm(`${id}-container-form`, false));
    document.getElementById(`${id}-container-name`).addEventListener('input', event => {
      const name = event.target.value.trim();
      document.getElementById(`${id}-save-container`).disabled = !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(name) || name.includes('--');
    });
    document.getElementById(`${id}-save-container`).addEventListener('click', () => {
      const name = document.getElementById(`${id}-container-name`).value.trim();
      if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/.test(name) || name.includes('--')) return;
      catalog[account.value] ||= [];
      catalog[account.value].push({ container: name, access: false });
      showForm(`${id}-container-form`, false);
      renderContainers(name);
    });

    renderContainers(flow.defaultContainer);
    if (['access', 'propagation', 'network', 'credential', 'version'].includes(validationState)) {
      section.querySelector(`input[name="${id}-destination"][value="blob"]`).checked = true;
    }
    syncType();
  }

  flows.forEach(mount);
  lucide.createIcons();
})();
