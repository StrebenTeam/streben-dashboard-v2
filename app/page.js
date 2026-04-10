'use client';

import { useState, useEffect } from 'react';
import { UserButton } from '@clerk/nextjs';
import Sidebar from '@/components/Sidebar';
import OverviewPage from '@/components/OverviewPage';
import AccountPage from '@/components/AccountPage';
import GroupPage from '@/components/GroupPage';
import MetaAccountPage from '@/components/MetaAccountPage';
import IntelligencePage from '@/components/IntelligencePage';
import LeadSourcesPage from '@/components/LeadSourcesPage';
import PipelinePage from '@/components/PipelinePage';
import LocationDetailPage from '@/components/LocationDetailPage';
import ChatWidget from '@/components/ChatWidget';

export default function Dashboard() {
  const [view, setView] = useState('overview');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedGhlLocation, setSelectedGhlLocation] = useState(null);
  const [selectedMetaAccount, setSelectedMetaAccount] = useState(null);
  const [weeks, setWeeks] = useState([]);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [selectedRange, setSelectedRange] = useState('last-week');
  const [accounts, setAccounts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [ghlData, setGhlData] = useState(null);
  const [accountGroups, setAccountGroups] = useState({});
  const [metaOverview, setMetaOverview] = useState(null);
  const [platformMap, setPlatformMap] = useState(null);
  const [metaAccounts, setMetaAccounts] = useState([]);

  useEffect(() => {
    fetch('/api/weeks').then(r => r.json()).then(w => {
      setWeeks(w);
      if (w.length > 0) setSelectedWeek(w[0].week_start);
    });
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/ghl/overview').then(r => r.json()).then(setGhlData).catch(() => {});
    fetch('/api/account-groups').then(r => r.json()).then(setAccountGroups).catch(() => {});
    fetch('/api/platform-map').then(r => r.json()).then(setPlatformMap).catch(() => {});
  }, []);

  useEffect(() => {
    let url = '/api/overview';
    let metaUrl = '/api/meta/overview';
    if (selectedRange && selectedRange !== 'custom') {
      url += '?range=' + selectedRange;
      metaUrl += '?range=' + selectedRange;
    } else if (selectedWeek) {
      url += '?week=' + selectedWeek;
      metaUrl += '?week=' + selectedWeek;
    } else {
      return;
    }
    fetch(url).then(r => r.json()).then(setOverview);
    fetch(metaUrl).then(r => r.json()).then(setMetaOverview).catch(() => {});
  }, [selectedRange, selectedWeek]);

  const navTo = (v, opts) => {
    opts = opts || {};
    setView(v);
    setSelectedAccount(opts.accountId || null);
    setSelectedGroup(opts.groupId || null);
    setSelectedGhlLocation(opts.locationId || null);
    setSelectedMetaAccount(opts.metaAccountId || null);
  };

  // Build sidebar account list, excluding grouped accounts
  const groupedIds = new Set();
  Object.values(accountGroups).forEach(g => {
    (g.accountIds || []).forEach(id => groupedIds.add(id));
  });
  const sidebarAccounts = accounts.filter(a => !groupedIds.has(a.id));

  const pageTitle = view === 'overview' ? 'MCC Overview' :
                    view === 'account' ? '' :
                    view === 'group' ? '' :
                    view === 'meta-account' ? '' :
                    view === 'intelligence' ? 'Intelligence' :
                    view === 'leads' ? 'Lead Sources' :
                    view === 'pipeline' ? 'Pipeline' :
                    view === 'ghl-location' ? '' : '';

  return (
    <div className="layout">
      <Sidebar
        view={view}
        selectedAccount={selectedAccount}
        selectedGroup={selectedGroup}
        selectedMetaAccount={selectedMetaAccount}
        accountGroups={accountGroups}
        sidebarAccounts={sidebarAccounts}
        platformMap={platformMap}
        metaOverview={metaOverview}
        onNavigate={navTo}
      />
      <div className="main">
        {view !== 'account' && view !== 'group' && view !== 'ghl-location' && view !== 'meta-account' && view !== 'intelligence' && (
          <div className="header">
            <h1>{pageTitle}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto' }}>
            <select
              className="week-select"
              value={selectedRange || 'last-week'}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'custom') {
                  setSelectedRange('custom');
                  if (!selectedWeek && weeks.length > 0) {
                    setSelectedWeek(weeks[0].week_start);
                  }
                } else {
                  setSelectedRange(val);
                }
              }}
            >
              <option value="last-week">Last Week</option>
              <option value="last-2-weeks">Last 2 Weeks</option>
              <option value="last-month">Last Month</option>
              <option value="last-quarter">Last Quarter</option>
              <option value="ytd">YTD</option>
              <option value="divider" disabled>-------</option>
              <option value="custom">Custom Week</option>
            </select>
            <UserButton afterSignOutUrl="/sign-in" />
            </div>
          </div>
        )}
        {selectedRange === 'custom' && view !== 'account' && view !== 'group' && view !== 'ghl-location' && view !== 'meta-account' && view !== 'intelligence' && (
          <div style={{ marginBottom: '20px' }}>
            <select
              className="week-select"
              value={selectedWeek || ''}
              onChange={(e) => setSelectedWeek(e.target.value)}
              style={{ marginLeft: '16px' }}
            >
              {weeks.map(w => (
                <option key={w.week_start} value={w.week_start}>
                  Week of {w.week_start}
                </option>
              ))}
            </select>
          </div>
        )}

        {view === 'overview' && (
          <OverviewPage
            data={overview}
            ghlData={ghlData}
            accountGroups={accountGroups}
            metaOverview={metaOverview}
            platformMap={platformMap}
            onSelectAccount={(id) => navTo('account', { accountId: id })}
            onSelectGroup={(id) => navTo('group', { groupId: id })}
            onSelectMetaAccount={(id) => navTo('meta-account', { metaAccountId: id })}
          />
        )}
        {view === 'account' && selectedAccount && (
          <AccountPage
            accountId={selectedAccount}
            ghlData={ghlData}
            platformMap={platformMap}
            onBack={() => navTo('overview')}
          />
        )}
        {view === 'group' && selectedGroup && (
          <GroupPage
            groupId={selectedGroup}
            ghlData={ghlData}
            platformMap={platformMap}
            onBack={() => navTo('overview')}
            onSelectAccount={(id) => navTo('account', { accountId: id })}
          />
        )}
        {view === 'meta-account' && selectedMetaAccount && (
          <MetaAccountPage
            metaAccountId={selectedMetaAccount}
            onBack={() => navTo('overview')}
          />
        )}
        {view === 'intelligence' && <IntelligencePage />}
        {view === 'leads' && (
          <LeadSourcesPage
            onSelectLocation={(id) => navTo('ghl-location', { locationId: id })}
          />
        )}
        {view === 'pipeline' && (
          <PipelinePage
            onSelectLocation={(id) => navTo('ghl-location', { locationId: id })}
          />
        )}
        {view === 'ghl-location' && selectedGhlLocation && (
          <LocationDetailPage
            locationId={selectedGhlLocation}
            onBack={() => navTo('leads')}
          />
        )}
        <ChatWidget />
      </div>
    </div>
  );
}
