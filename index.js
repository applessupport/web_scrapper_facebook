const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const { db } = require('./firebaseConfig');
const { collection, setDoc, doc, getDoc } = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const docName = "Akash_Doc1111";

// List of User-Agents to rotate
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.159 Safari/537.36',
    'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:53.0) Gecko/20100101 Firefox/53.0',
    'Mozilla/5.0 (Linux; Android 10; Pixel 3 XL Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.149 Mobile Safari/537.36'
];

const proxyList = [
    "154.213.204.125:3128",
    "104.207.32.182:3128",
    "104.207.41.94:3128",
    "104.167.27.147:3128",
    "156.228.118.195:3128",
    "45.202.78.235:3128",
    "104.167.25.132:3128",
    "156.228.124.212:3128",
    "156.253.174.184:3128",
    "156.228.119.74:3128",
    "156.253.170.76:3128",
    "154.213.204.173:3128",
    "156.228.181.124:3128",
    "156.228.88.192:3128",
    "104.207.40.131:3128",
    "104.207.43.138:3128",
    "156.253.177.170:3128",
    "156.228.115.40:3128",
    "104.207.32.165:3128",
    "156.253.179.91:3128",
    "45.201.10.253:3128",
    "104.207.63.205:3128",
    "156.228.178.238:3128",
    "104.207.63.195:3128",
    "156.228.190.190:3128",
    "104.167.25.226:3128",
    "45.201.11.155:3128",
    "154.213.195.39:3128",
    "156.228.88.184:3128",
    "154.94.12.250:3128",
    "156.228.78.194:3128",
    "156.233.86.28:3128",
    "104.167.27.87:3128",
    "156.228.180.46:3128",
    "156.253.169.9:3128",
    "156.228.78.204:3128",
    "156.228.179.126:3128",
    "156.253.170.246:3128",
    "104.167.26.170:3128",
    "154.94.13.238:3128",
    "45.202.77.190:3128",
    "156.228.114.237:3128",
    "156.228.189.15:3128",
    "156.228.185.111:3128",
    "154.94.12.136:3128",
    "104.207.53.101:3128",
    "104.207.60.23:3128",
    "156.228.180.191:3128",
    "104.207.43.22:3128",
    "156.253.177.26:3128",
    "154.214.1.65:3128",
    "156.233.95.249:3128",
    "156.228.94.24:3128",
    "154.213.204.83:3128",
    "156.233.86.166:3128",
    "156.233.91.215:3128",
    "104.167.31.63:3128",
    "156.253.179.151:3128",
    "156.228.190.9:3128",
    "45.201.10.206:3128",
    "154.213.195.250:3128",
    "104.207.51.78:3128",
    "156.228.83.224:3128",
    "156.233.88.207:3128",
    "154.213.202.110:3128",
    "104.167.28.185:3128",
    "156.228.94.218:3128",
    "156.233.95.41:3128",
    "104.167.25.234:3128",
    "156.253.179.127:3128",
    "156.228.174.179:3128",
    "156.228.176.4:3128",
    "156.228.99.191:3128",
    "104.207.32.158:3128",
    "156.233.90.115:3128",
    "156.228.182.100:3128",
    "104.207.40.139:3128",
    "156.228.174.97:3128",
    "156.228.77.196:3128",
    "104.167.26.231:3128",
    "156.228.92.1:3128",
    "156.240.99.146:3128",
    "156.228.181.91:3128",
    "156.228.105.218:3128",
    "156.233.91.19:3128",
    "156.228.117.210:3128",
    "156.228.94.199:3128",
    "154.213.199.206:3128",
    "156.228.175.119:3128",
    "104.207.48.246:3128",
    "104.207.48.203:3128",
    "156.228.96.109:3128",
    "104.207.40.145:3128",
    "156.233.90.251:3128",
    "156.228.91.6:3128",
    "104.207.58.10:3128",
    "156.228.87.239:3128",
    "156.228.82.235:3128",
    "156.253.175.57:3128",
    "154.214.1.90:3128"
  ];

function getRandomProxy() {
    const randomIndex = Math.floor(Math.random() * proxyList.length);
    return proxyList[randomIndex];
}

// Function to generate a random delay
function randomDelay(min = 5000, max = 15000) {
    return Math.floor(Math.random() * (max - min + 1)) + min; // Random delay between 5 and 15 seconds
}

// Function to rotate headers
function rotateHeaders() {
    const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
    return {
        'User-Agent': randomUserAgent,
        'Accept-Language': 'en-US,en;q=0.9',
    };
}

// Function to add delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchEmails(name, docName, location) {
    let retries = 3;
    let uniqueEmails = []; // Declare uniqueEmails at the function scope

    while (retries > 0) {
        try {
            // const proxy = getRandomProxy();
            // console.log("Proxy used -->", proxy);
            const browser = await puppeteer.launch({
                headless: false,
            });

            const page = await browser.newPage();
            const emails = new Set();
             const query = `${name} @gmail.com @yahoo.com senior elderly retired site:facebook.com ${location}`;


            // Add a random delay before navigating
            await delay(randomDelay(3000, 5000));

            // Open the first page of DuckDuckGo search results
            await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
                waitUntil: 'networkidle2',
                timeout: 60000,
            });

            console.log(`Navigated to page 1 of DuckDuckGo search results for query: "${query}"`);

            // Loop to check for the presence of the "More Results" button and navigate through all pages
            while (true) {
                // Apply random header rotation
                await page.setExtraHTTPHeaders(rotateHeaders());

                // Wait for the page to fully load before scraping
                await page.waitForSelector('*', { timeout: 60000 });

                const content = await page.content();
                const $ = cheerio.load(content);

                // Refined regex to match email addresses that:
                // - Do not start with "."
                // - Do not contain "+", "$", or "&"
                const emailRegex = /(?<!\.)\b[a-zA-Z0-9._%+-]+@(gmail\.com|yahoo\.com)\b/g;
                $('*').each((_, element) => {
                    const text = $(element).text();
                    const matches = text.match(emailRegex);
                    if (matches) {
                        matches.forEach(email => {
                            // Only add emails that don't start with "." and don't contain "+", "$", or "&"
                            if (!email.startsWith('.') && !/[+&$]/.test(email)) {
                                emails.add(email);
                            }
                        });
                    }
                });

                const moreResultsButton = await page.$('#more-results');  // Adjust the selector for your "More Results" button

                if (moreResultsButton) {
                    let isButtonEnabled = await page.waitForSelector('#more-results:not([disabled])', { 
                        timeout: 10000 
                    }).catch(() => null); 
                    if (isButtonEnabled) {
                        // Wait for the "More Results" button to be enabled
                        await page.waitForSelector('#more-results:not([disabled])', { timeout: 60000 });

                        // Apply random delay before clicking the "More Results" button
                        await delay(randomDelay(5000, 10000));  // Random delay before clicking

                        // Click to load more results
                        await moreResultsButton.click();
                        console.log('Loaded more results.');

                        // Wait for new results to load
                        // Adjust selector as needed based on the page structure
                        await page.waitForSelector('.react-results--main li', { timeout: 60000 });

                        // Re-query the "More Results" button after the page has been updated
                        isButtonEnabled = await page.waitForSelector('#more-results:not([disabled])', { timeout: 60000 }).catch(()=>
                         null
                        );
                       
                    } else {
                        console.log("More result is disabled for more than 10 seconds");
                        retries = 0; 
                        break;
                    }
                    
                } else {
                    // No more results to load, exit the loop
                    console.log('No more results found.');
                    break;
                }
            } 

            await browser.close();

            const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);

try {
    // Fetch all documents in the collection
    const allDocsSnapshot = await getDocs(collection(db, 'scrapeddata_facebook'));

    // Aggregate emails from all documents to check for duplicates
    const allEmailsSet = new Set();
    allDocsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.emails) {
            data.emails.forEach(email => allEmailsSet.add(email));
        }
    });

    // Get existing emails in the current document (docRef)
    const currentDocSnapshot = await getDoc(docRef);
    const currentDocEmails = currentDocSnapshot.exists() ? currentDocSnapshot.data().emails || [] : [];

    // Filter current document emails to remove duplicates
    const uniqueEmails = Array.from(emails).filter(email => !allEmailsSet.has(email));

    // Combine current doc's emails with new unique emails
    const updatedEmails = Array.from(new Set([...currentDocEmails, ...uniqueEmails]));

    // Update the document with the combined unique emails
    await setDoc(docRef, {
        name,
        emails: updatedEmails,
        timestamp: new Date()
    });
    console.log(`Added ${uniqueEmails.length} new unique emails to Firestore with custom document ID: ${docName}`);
} catch (error) {
    console.error('Error saving emails to Firestore:', error);
}


            return uniqueEmails;
        } catch (error) {
            console.error('Error extracting emails:', error);
            if (!error.message.includes("TimeoutError: Waiting for selector `#more-results:not([disabled])` failed")){
                retries = 0;
                console.log("UniqueEmails--->",uniqueEmails);
                return uniqueEmails;
            } else {
                retries--;
                if (retries === 0) throw new Error('Failed after multiple attempts');
                console.log(`Retrying with a new proxy... (${retries} attempts left)`);
            }
        }
    }
}






// Endpoint to download emails as Excel file
app.get('/download', async (req, res) => {
    if (!docName) {
        return res.status(400).json({ error: 'Document name is required' });
    }

    try {
        const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);
        const docSnapshot = await getDoc(docRef);

        if (!docSnapshot.exists()) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const { emails, name } = docSnapshot.data();

        // Create a new Excel workbook and worksheet
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Emails');

        // Add headers to the worksheet
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 30 },
            { header: 'Email', key: 'email', width: 30 },
        ];

        // Add data to worksheet rows
        emails.forEach(email => {
            worksheet.addRow({ name, email });
        });

        // Set response headers and send Excel file
        res.setHeader(
            'Content-Disposition',
            `attachment; filename=${docName}_emails.xlsx`
        );
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        // Write workbook to response
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).json({ error: 'An error occurred while generating the Excel file' });
    }
});

// Endpoint to extract emails from Google search
app.post('/extract-emails', async (req, res) => {
    const { name, location } = req.body;

    if (!name || !docName || !location) {
        return res.status(400).json({ error: 'Name and custom document name are required' });
    }

    try {
        console.log(`Received request to search emails for name: "${name}" with custom document name: "${docName}"`);
        const emails = await searchEmails(name, docName,location);
        
        const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);
        const docSnapshot = await getDoc(docRef);
        const allexistingEmails = new Set(docSnapshot.exists() ? docSnapshot.data().emails : []);

        console.log("Total Emails After Push -->",allexistingEmails);

        res.json({totalNewEmails:emails.length,totalEmailsInDoc: allexistingEmails.length });

    } catch (error) {
        console.error('Error extracting emails:', error);
        res.status(500).json({ error: 'An error occurred while extracting emails' });
    }
});

// Start the Express server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
