export interface CsvContact {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
}

export interface CsvContactParseResult {
  contacts: CsvContact[];
  error?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseCsvRows(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];

    if (character === '"') {
      if (inQuotes && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === ',' && !inQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseCsvContacts(content: string): CsvContactParseResult {
  const rows = parseCsvRows(content);
  if (rows.length === 0) return { contacts: [], error: 'The CSV file is empty.' };

  const normalizedHeaders = rows[0].map((header) => header.replace(/^\uFEFF/, '').toLowerCase().replace(/\s/g, ''));
  const hasHeader = normalizedHeaders.some((header) => ['email', 'firstname', 'lastname', 'company'].includes(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const emailIndex = hasHeader ? normalizedHeaders.indexOf('email') : 0;
  const firstNameIndex = hasHeader ? normalizedHeaders.indexOf('firstname') : 1;
  const lastNameIndex = hasHeader ? normalizedHeaders.indexOf('lastname') : 2;
  const companyIndex = hasHeader ? normalizedHeaders.indexOf('company') : 3;
  const contacts: CsvContact[] = [];
  const invalidRows: number[] = [];
  const seenEmails = new Set<string>();

  dataRows.forEach((row, index) => {
    const email = row[emailIndex]?.trim() || '';
    if (!email) return;
    if (!emailPattern.test(email)) {
      invalidRows.push(index + (hasHeader ? 2 : 1));
      return;
    }

    const normalizedEmail = email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) return;
    seenEmails.add(normalizedEmail);

    contacts.push({
      email,
      firstName: row[firstNameIndex]?.trim() || '',
      lastName: row[lastNameIndex]?.trim() || '',
      company: row[companyIndex]?.trim() || '',
    });
  });

  if (contacts.length === 0) {
    return { contacts: [], error: 'No valid email addresses were found in the CSV file.' };
  }

  return {
    contacts,
    ...(invalidRows.length > 0
      ? { error: `Invalid email data found on CSV row${invalidRows.length === 1 ? '' : 's'} ${invalidRows.join(', ')}.` }
      : {}),
  };
}

export function formatCsvContacts(contacts: CsvContact[]): string {
  return contacts.map(({ email, firstName = '', lastName = '', company = '' }) => [email, firstName, lastName, company].join(', ')).join('\n');
}