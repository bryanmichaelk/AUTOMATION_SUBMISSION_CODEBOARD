const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Skrip pembuatan CSV yang akan dijalankan di konteks halaman submissions,
// disimpan sebagai string untuk dieksekusi melalui page.evaluate

const linkCodeboard = 'https://codeboard.io/users/e5026221025bryanmichaelk';
const generateCsvScript = `
(function() {
  const allItems = document.querySelectorAll('li.ng-scope');
  const dataMap = {};

  allItems.forEach(item => {
    const h4 = item.querySelector('h4');
    if (!h4) return;
    let usernameFull = h4.textContent.trim();
    let username = usernameFull.split(' ')[0].trim();
    if (!username) return;

    const linkElem = [...item.querySelectorAll('a')].find(a =>
      a.textContent.trim() === 'Open in IDE'
    );
    if (!linkElem) return;
    let submissionLink = linkElem.href;
    submissionLink = submissionLink.replace(/\\r?\\n|\\r/g, '');

    if (!dataMap[username]) {
      dataMap[username] = [];
    }
    dataMap[username].push({ username, link: submissionLink });
  });

  const csvRows = [];
  csvRows.push('Username,Submission');

  for (const username in dataMap) {
    const submissions = dataMap[username];
    const lastSubmission = submissions[submissions.length - 1];
    const cleanedUsername = lastSubmission.username.replace(/"/g, '""');
    const cleanedLink = lastSubmission.link.replace(/"/g, '""');
    const hyperlinkFormula = \`=HYPERLINK("\${cleanedLink}","Open in IDE")\`;
    const row = \`\${cleanedUsername};;\${hyperlinkFormula}\`;
    csvRows.push(row);
  }

  const csvContent = csvRows.join('\\n');
  return csvContent;
})();
`;

(async () => {
  // 1. Meluncurkan browser menggunakan userDataDir untuk menyimpan sesi login
  // Jika belum login, jendela browser akan terbuka agar Anda bisa login secara manual ke Codeboard.
  const browser = await puppeteer.launch({
    headless: true,
    userDataDir: './user_data'
  });
  const page = await browser.newPage();

  // Tambahkan listener untuk log dari dalam konteks halaman
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  // (Opsional) Mengatur folder download:
  const downloadPath = path.resolve(__dirname, 'downloads');
  fs.mkdirSync(downloadPath, { recursive: true });
  const cdpSession = await page.target().createCDPSession();
  await cdpSession.send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath,
  });

  // 2. Buka halaman All Projects (ganti URL di bawah sesuai kebutuhan)
  await page.goto(linkCodeboard, { waitUntil: 'networkidle2' });
  console.log("Lewat ke halaman All Projects");

  // Jika belum login, Anda harus login secara manual di jendela browser yang terbuka,
  // kemudian baru lanjutkan proses di bawah.
  
  // Tunggu sampai elemen card muncul
  await page.waitForSelector('.card');

  // 3. Ekstrak link "Show project submissions" dari setiap card yang judulnya mengandung 'ES234317-2025-Pretest1'
  const submissionLinks = await page.evaluate(() => {
    // Seleksi semua elemen card
    const allCards = document.querySelectorAll('.card');
    console.log("Jumlah card ditemukan:", allCards.length);
    const links = [];

    allCards.forEach(card => {
      // Update selector sesuai struktur DOM Anda.
      // Misalnya, jika judul berada di dalam .card-header .card-header-title .card-text-ellipsis a
      const titleAnchor = card.querySelector('.card-header .card-header-title .card-text-ellipsis a');
      if (!titleAnchor) {
        console.log("Judul tidak ditemukan di card ini.");
        return;
      }

      const titleText = titleAnchor.textContent.trim();
      console.log("Judul card:", titleText);
      // Pastikan string yang dibandingkan sesuai (misalnya 'ES234317-2025-Pretest1')
      if (titleText.includes('ES234317-2025-Pretest1')) {
        console.log("Judul card cocok, mencari link submission...");
        // Cari link dengan teks yang berisi "Show project submissions"
        const linkElem = [...card.querySelectorAll('a')].find(a =>
          a.title.trim().includes('Show project submissions')
        );
        if (linkElem) {
          console.log("Link submission ditemukan:", linkElem.href);
          links.push(linkElem.href);
        } else {
          console.log("Link submission tidak ditemukan di card ini.");
        }
      }
    });

    return links;
  });

  console.log('Ditemukan link submissions:', submissionLinks);

  // 4. Looping setiap link submission untuk menjalankan skrip CSV dan menyimpan hasilnya
  for (let i = 0; i < submissionLinks.length; i++) {
    const link = submissionLinks[i];
    console.log(`Memproses link: ${link}`);

    // Buka halaman submission
    await page.goto(link, { waitUntil: 'networkidle2' });
    // Jalankan skrip CSV dalam konteks halaman submission
    const csvContent = await page.evaluate(generateCsvScript);

    // Tulis file CSV di folder downloads dengan nama berbeda untuk tiap submission
    const filePath = path.join(downloadPath, `submissions_${i + 1}.csv`);
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    console.log(`Berhasil menulis file: ${filePath}`);
  }

  // Tutup browser setelah selesai memproses semua link
  await browser.close();
  console.log('Selesai memproses semua submission!');
})();
