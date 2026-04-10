'use client';

import { useState, useEffect } from 'react';
import MetricCard from './MetricCard';
import { fmt } from '@/lib/formatters';
import { categorizeSource } from '@/lib/sources';

export default function LocationDetailPage({ locationId, onBack }) {
  const [locationData, setLocationData] = useState(null);
  const [leadSourcesData, setLeadSourcesData] = useState(null);
  const [pipelineData, setPipelineData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/ghl/overview').then(r => r.json()),
      fetch('/api/ghl/locations/' + locationId + '/lead-sources').then(r => r.json()),
      fetch('/api/ghl/locations/' + locationId + '/pipeline-summary').then(r => r.json())
    ]).then(([ovData, lsData, pData]) => {
      const locData = ovData.locations.find(l => l.ghlLocationId === locationId);
      setLocationData(locData);
      setLeadSourcesData(lsData);
      setPipelineData(pData);
      setLoading(false);
    }).catch(e => { console.error(e); setLoading(false); });
  }, [locationId]);

  if (loading) return <div className="empty-state">Loading...</div>;
  if (!locationData) return <div className="empty-state">Location not found</div>;

  const sourceChartData = Object.entries(locationData.contacts.sources || {}).map(([src, count]) => ({
    name: src.slice(0, 20),
    count: count,
    category: categorizeSource(src)
  }));

  const stageChartData = Object.entries(locationData.pipeline.stages || {}).map(([stage, count]) => ({
    name: stage,
    count: count
  }));

  return (
    <>
      <div className="back-link" onClick={onBack}>{'\u2190'} Back</div>
      <div className="header">
        <h1>{locationData.ghlLocationName + (locationData.googleAdsAccountName ? ' (' + locationData.googleAdsAccountName + ')' : '')}</h1>
      </div>
      <div className="crm-metrics-grid">
        <MetricCard label="Total Contacts" value={fmt(locationData.contacts.total)} />
        <MetricCard label="Pipeline Total" value={fmt(locationData.pipeline.total)} />
      </div>
      <div className="section-title">Lead Sources</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Count</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            {sourceChartData.map(item => {
              const badgeClass = 'source-badge source-' + item.category;
              return (
                <tr key={item.name}>
                  <td>{item.name}</td>
                  <td>{fmt(item.count)}</td>
                  <td><span className={badgeClass}>{item.category.replace(/-/g, ' ')}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="section-title" style={{ marginTop: 24 }}>Pipeline Breakdown</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {stageChartData.map(item => (
              <tr key={item.name}>
                <td>{item.name}</td>
                <td>{fmt(item.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
