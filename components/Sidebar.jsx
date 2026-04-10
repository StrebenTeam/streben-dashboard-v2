'use client';

export default function Sidebar({ view, selectedAccount, selectedGroup, selectedMetaAccount, accountGroups, sidebarAccounts, platformMap, metaOverview, onNavigate }) {
  return (
    <div className="sidebar">
      <div className="sidebar-logo">Streben</div>
      <div className="sidebar-section">Views</div>
      <div
        className={'sidebar-item' + (view === 'overview' ? ' active' : '')}
        onClick={() => onNavigate('overview')}
      >
        {'\uD83D\uDCCA'} Overview
      </div>
      <div
        className={'sidebar-item' + (view === 'intelligence' ? ' active' : '')}
        onClick={() => onNavigate('intelligence')}
      >
        {'\uD83E\uDDE0'} Intelligence
      </div>
      <div className="sidebar-section" style={{ marginTop: 16 }}>CRM / Leads</div>
      <div
        className={'sidebar-item' + (view === 'leads' ? ' active' : '')}
        onClick={() => onNavigate('leads')}
      >
        Lead Sources
      </div>
      <div
        className={'sidebar-item' + (view === 'pipeline' ? ' active' : '')}
        onClick={() => onNavigate('pipeline')}
      >
        Pipeline
      </div>
      <div className="sidebar-section" style={{ marginTop: 16 }}>Google Ads</div>
      {/* Group entries first */}
      {Object.entries(accountGroups).map(([gId, g]) => (
        <div
          key={gId}
          className={'sidebar-item' + (view === 'group' && selectedGroup === gId ? ' active' : '')}
          onClick={() => onNavigate('group', { groupId: gId })}
        >
          {g.name}
        </div>
      ))}
      {/* Standalone accounts */}
      {sidebarAccounts.map(a => (
        <div
          key={a.id}
          className={'sidebar-item' + (view === 'account' && selectedAccount === a.id ? ' active' : '')}
          onClick={() => onNavigate('account', { accountId: a.id })}
        >
          {a.name}
        </div>
      ))}
      {/* Meta-only accounts */}
      {platformMap && platformMap.metaOnly && platformMap.metaOnly.length > 0 && (
        <div className="sidebar-section" style={{ marginTop: 16 }}>Meta Ads</div>
      )}
      {platformMap && platformMap.metaOnly && platformMap.metaOnly.map(metaId => {
        const ma = metaOverview && metaOverview.accounts ? (metaOverview.accounts || []).find(a => a.account_id === metaId) : null;
        const displayName = ma ? (ma.client_name || ma.account_name) : (platformMap.metaNames && platformMap.metaNames[metaId] ? platformMap.metaNames[metaId] : metaId);
        return (
          <div
            key={metaId}
            className={'sidebar-item' + (view === 'meta-account' && selectedMetaAccount === metaId ? ' active' : '')}
            onClick={() => onNavigate('meta-account', { metaAccountId: metaId })}
          >
            {displayName}
          </div>
        );
      })}
    </div>
  );
}
