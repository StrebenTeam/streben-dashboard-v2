const ACCOUNT_GROUPS = {
  'push-fitness': {
    name: 'Push Fitness',
    accountIds: ['7302638252', '1770197758', '8069761184', '8948630925'],
    locations: [
      { accountId: '7302638252', label: 'College Point' },
      { accountId: '1770197758', label: 'Melville' },
      { accountId: '8069761184', label: 'Fresh Meadows' },
      { accountId: '8948630925', label: 'New Hyde Park' }
    ]
  }
};

export async function GET() {
  return Response.json(ACCOUNT_GROUPS);
}
