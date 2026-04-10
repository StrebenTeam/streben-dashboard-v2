/**
 * benchmarks.js - Industry benchmark data by vertical for the intelligence rule engine.
 * Sources: WordStream, LocaliQ, Pixis, 9clouds, Varos, RUNNER Agency, InfluxMD
 */
const VERTICALS = {
  senior_living: {
    label: 'Senior Living / Memory Care',
    google: {
      cpc: { low: 4.00, expected: 8.50, high: 15.00, ceiling: 25.00 },
      ctr: { critical: 0.015, low: 0.025, expected: 0.04, good: 0.06 },
      conversionRate: { critical: 0.02, low: 0.04, expected: 0.06, good: 0.10 },
      cpl: { good: 50, expected: 120, high: 200, critical: 350 },
      impressionShare: {
        branded: { target: 0.80, warning: 0.60, critical: 0.40 },
        generic: { target: 0.50, warning: 0.30, critical: 0.15 }
      },
      qualityScore: { critical: 4, low: 5, target: 7, good: 8 },
    },
    meta: {
      cpc: { low: 1.00, expected: 3.50, high: 6.00, ceiling: 10.00 },
      ctr: { critical: 0.005, low: 0.008, expected: 0.012, good: 0.02 },
      cpl: { good: 30, expected: 80, high: 150, critical: 250 },
      frequency: { healthy: 2.0, warning: 2.5, fatiguing: 3.5, exhausted: 5.0 },
      creativeFatigueWindow: 14,
      thumbstopRate: { weak: 0.25, ok: 0.35, strong: 0.50, excellent: 0.65 },
    },
    pipeline: {
      leadToTour: { critical: 0.05, low: 0.10, expected: 0.20, good: 0.30 },
      tourToMoveIn: { critical: 0.10, low: 0.20, expected: 0.30, good: 0.45 },
      speedToLead: { excellent: 5, good: 30, slow: 120, critical: 1440 },
      callVsFormMultiplier: 3.0,
    },
    daypart: { peakHours: [9,10,11,12,13,14,15,16], offHoursSpendThreshold: 0.15 },
    geo: { primaryRadius: 10, secondaryRadius: 25, maxRadius: 50 },
    commonNegatives: ['jobs','careers','hiring','salary','nursing school','free','volunteer','internship','CNA training','complaints','lawsuit','abuse','neglect'],
  },
  fitness: {
    label: 'Fitness / Gym',
    google: {
      cpc: { low: 0.80, expected: 2.00, high: 4.00, ceiling: 6.00 },
      ctr: { critical: 0.02, low: 0.035, expected: 0.05, good: 0.07 },
      conversionRate: { critical: 0.03, low: 0.05, expected: 0.08, good: 0.12 },
      cpl: { good: 10, expected: 25, high: 50, critical: 80 },
      impressionShare: {
        branded: { target: 0.85, warning: 0.65, critical: 0.45 },
        generic: { target: 0.45, warning: 0.25, critical: 0.12 }
      },
      qualityScore: { critical: 4, low: 5, target: 7, good: 8 },
    },
    meta: {
      cpc: { low: 0.50, expected: 1.50, high: 3.00, ceiling: 5.00 },
      ctr: { critical: 0.006, low: 0.01, expected: 0.015, good: 0.025 },
      cpl: { good: 5, expected: 15, high: 35, critical: 60 },
      frequency: { healthy: 2.0, warning: 3.0, fatiguing: 4.0, exhausted: 6.0 },
      creativeFatigueWindow: 10,
      thumbstopRate: { weak: 0.30, ok: 0.40, strong: 0.55, excellent: 0.70 },
    },
    pipeline: {
      leadToVisit: { critical: 0.10, low: 0.20, expected: 0.35, good: 0.50 },
      visitToSignup: { critical: 0.20, low: 0.35, expected: 0.50, good: 0.65 },
      speedToLead: { excellent: 5, good: 15, slow: 60, critical: 480 },
      callVsFormMultiplier: 2.0,
    },
    daypart: { peakHours: [6,7,8,11,12,16,17,18,19], offHoursSpendThreshold: 0.10 },
    geo: { primaryRadius: 3, secondaryRadius: 7, maxRadius: 12 },
    commonNegatives: ['free workout','home workout','youtube workout','bodyweight exercises','no equipment','gym equipment for sale','used treadmill','personal trainer certification','gym jobs'],
  },
  healthcare: {
    label: 'Healthcare / Primary Care',
    google: {
      cpc: { low: 2.50, expected: 5.64, high: 9.00, ceiling: 14.00 },
      ctr: { critical: 0.015, low: 0.025, expected: 0.043, good: 0.06 },
      conversionRate: { critical: 0.03, low: 0.05, expected: 0.08, good: 0.15 },
      cpl: { good: 25, expected: 66, high: 120, critical: 200 },
      impressionShare: {
        branded: { target: 0.80, warning: 0.60, critical: 0.40 },
        generic: { target: 0.55, warning: 0.35, critical: 0.18 }
      },
      qualityScore: { critical: 4, low: 5, target: 7, good: 8 },
    },
    meta: {
      cpc: { low: 0.80, expected: 2.50, high: 5.00, ceiling: 8.00 },
      ctr: { critical: 0.005, low: 0.008, expected: 0.012, good: 0.02 },
      cpl: { good: 20, expected: 50, high: 100, critical: 180 },
      frequency: { healthy: 2.0, warning: 2.3, fatiguing: 3.0, exhausted: 5.0 },
      creativeFatigueWindow: 14,
      thumbstopRate: { weak: 0.25, ok: 0.35, strong: 0.50, excellent: 0.65 },
    },
    pipeline: {
      leadToBooked: { critical: 0.10, low: 0.20, expected: 0.35, good: 0.50 },
      bookedToShowed: { critical: 0.50, low: 0.65, expected: 0.75, good: 0.85 },
      speedToLead: { excellent: 5, good: 30, slow: 120, critical: 1440 },
      callVsFormMultiplier: 3.5,
    },
    daypart: { peakHours: [8,9,10,11,12,13,14,15,16,17], offHoursSpendThreshold: 0.12 },
    geo: { primaryRadius: 5, secondaryRadius: 15, maxRadius: 25 },
    commonNegatives: ['free clinic','free health screening','medical school','nursing jobs','healthcare careers','home remedies','DIY treatment','hospital emergency'],
  },
  optometry: {
    label: 'Optometry / Eye Care',
    google: {
      cpc: { low: 2.00, expected: 5.64, high: 9.00, ceiling: 14.00 },
      ctr: { critical: 0.015, low: 0.025, expected: 0.04, good: 0.06 },
      conversionRate: { critical: 0.05, low: 0.08, expected: 0.18, good: 0.25 },
      cpl: { good: 15, expected: 31, high: 65, critical: 120 },
      impressionShare: {
        branded: { target: 0.80, warning: 0.60, critical: 0.40 },
        generic: { target: 0.55, warning: 0.35, critical: 0.18 }
      },
      qualityScore: { critical: 4, low: 5, target: 7, good: 8 },
    },
    meta: {
      cpc: { low: 0.80, expected: 2.00, high: 4.00, ceiling: 7.00 },
      ctr: { critical: 0.005, low: 0.008, expected: 0.012, good: 0.02 },
      cpl: { good: 15, expected: 40, high: 80, critical: 140 },
      frequency: { healthy: 2.0, warning: 2.3, fatiguing: 3.0, exhausted: 5.0 },
      creativeFatigueWindow: 14,
      thumbstopRate: { weak: 0.25, ok: 0.35, strong: 0.50, excellent: 0.65 },
    },
    pipeline: {
      leadToBooked: { critical: 0.10, low: 0.25, expected: 0.40, good: 0.55 },
      bookedToShowed: { critical: 0.55, low: 0.65, expected: 0.78, good: 0.88 },
      speedToLead: { excellent: 5, good: 30, slow: 120, critical: 1440 },
      callVsFormMultiplier: 3.0,
    },
    daypart: { peakHours: [8,9,10,11,12,13,14,15,16,17], offHoursSpendThreshold: 0.12 },
    geo: { primaryRadius: 5, secondaryRadius: 12, maxRadius: 20 },
    commonNegatives: ['wine glasses','drinking glasses','sunglasses','reading glasses amazon','buy glasses online cheap','contacts without prescription','eye doctor jobs','optometrist salary','free eye exam','walmart vision center','costco optical'],
  },
};

function getBenchmarks(vertical) { return VERTICALS[vertical] || VERTICALS.healthcare; }
function getVerticals() {
  var result = {};
  Object.keys(VERTICALS).forEach(function(key) { result[key] = VERTICALS[key].label; });
  return result;
}
module.exports = { VERTICALS, getBenchmarks, getVerticals };
