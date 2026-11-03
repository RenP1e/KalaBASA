// Sample findings used ONLY by the demo: seed applications in data.js and the mock AI provider.
// Real AI output never touches this file. Delete it (and the mock provider) once the real provider ships.
(function () {
  const T = {
    address: {
      title: 'Possible address inconsistency',
      why: 'Unit 12 and Unit 21 differ. “St.” and “Street” were treated as equivalent; other address fields match. Verify both source pages before deciding.',
      tags: [{ t: 'Unit number differs', tone: 'warn' }, { t: 'Other address fields match', tone: 'info' }],
      a: { file: 'Unified Application Form.pdf', page: 1, meta: 'Page 1 · Business address', label: 'Business address',
        segs: [{ t: 'Unit 12', hl: true }, { t: ', 48 Maginhawa St.' }], sub: 'Brgy. Teacher’s Village East, Quezon City' },
      b: { file: 'Lease Contract.pdf', page: 2, meta: 'Page 2 · Leased premises', label: 'Leased premises',
        segs: [{ t: 'Unit 21', hl: true }, { t: ', 48 Maginhawa Street' }], sub: 'Brgy. Teacher’s Village East, Quezon City' },
    },
    clearance: {
      title: 'Barangay clearance may be expired',
      why: 'The clearance validity date falls before the application date. Confirm whether a renewed clearance was submitted before deciding.',
      tags: [{ t: 'Validity ended', tone: 'warn' }, { t: 'Compared to filing date', tone: 'info' }],
      a: { file: 'Barangay Clearance.pdf', page: 1, meta: 'Page 1 · Validity', label: 'Valid until',
        segs: [{ t: '30 Sep 2026', hl: true }], sub: 'Issued 1 Oct 2025' },
      b: { file: 'Unified Application Form.pdf', page: 1, meta: 'Page 1 · Application date', label: 'Application date',
        segs: [{ t: '3 Nov 2026' }], sub: 'Filed through the online portal' },
    },
    dtiName: {
      title: 'Business name differs across documents',
      why: 'The last word of the business name differs between the two documents. Other fields match; confirm which name is the registered one.',
      tags: [{ t: 'Name differs', tone: 'warn' }, { t: 'Owner name matches', tone: 'info' }],
      a: { file: 'DTI Certificate.pdf', page: 1, meta: 'Page 1 · Registered name', label: 'Registered name',
        segs: [{ t: 'Pinoy Print ' }, { t: 'Hub', hl: true }], sub: 'DTI business name registration' },
      b: { file: 'Unified Application Form.pdf', page: 1, meta: 'Page 1 · Business name', label: 'Business name',
        segs: [{ t: 'Pinoy Print ' }, { t: 'Shop', hl: true }], sub: 'As entered on the application' },
    },
    lease: {
      title: 'Lease contract may be unsigned',
      why: 'The lessor signature area looks blank while the lessee has signed. Verify the signature page before deciding.',
      tags: [{ t: 'Lessor signature missing', tone: 'warn' }, { t: 'Lessee signed', tone: 'info' }],
      a: { file: 'Lease Contract.pdf', page: 4, meta: 'Page 4 · Signature page', label: 'Lessor signature',
        segs: [{ t: 'No signature detected', hl: true }], sub: 'Notary block present' },
      b: { file: 'Lease Contract.pdf', page: 4, meta: 'Page 4 · Signature page', label: 'Lessee signature',
        segs: [{ t: 'Signature detected' }], sub: 'Dated 14 Oct 2026' },
    },
  };
  const mk = (key, status) => Object.assign({ key, status: status || 'awaiting' }, JSON.parse(JSON.stringify(T[key])));

  KB.fixtures = { TEMPLATES: T, finding: mk };
})();
