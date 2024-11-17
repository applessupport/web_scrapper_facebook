const express = require('express');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const cheerio = require('cheerio');
const ExcelJS = require('exceljs');
const { db } = require('./firebaseConfig');
const { collection, setDoc, doc, getDocs, getDoc } = require('firebase/firestore');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const docName = "Akash_Doc1311";

// Random delay generator
function randomDelay(min = 50, max = 150) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function searchEmails(name, docName, location) {
    let retries = 3;
    let uniqueEmails = [];

    while (retries > 0) {
        let driver;
        try {
            const options = new chrome.Options().addArguments('--headless');
            driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

            const query = `${name} @gmail.com senior retired site:facebook.com location ${location}`;
            await driver.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
            await delay(randomDelay());

            const emails = new Set();
            const emailRegex = /(?<!\.)\b[a-zA-Z0-9._%+-]+@(gmail\.com|yahoo\.com)\b/g;

            console.log("Searching...");
            let matchCount = 0;
            let moreResultsCount = 0;
            while (true) {
                const pageContent = await driver.getPageSource();
                const $ = cheerio.load(pageContent);

                $('*').each((_, element) => {
                    const text = $(element).text();
                    const matches = text.match(emailRegex);
                    if (matches) {
                        matchCount += matches.length;
                        matches.forEach(email => {
                            if (!email.startsWith('.') && !/[+&$]/.test(email)) {
                                emails.add(email);
                            }
                        });
                    }
                });

                // Attempt to locate and click the "More Results" button with retries
                const moreResultsClicked = await fetchAndClickMoreResults(driver);
                if (!moreResultsClicked) {
                    console.log('No more results found. Stopping scraping.');
                    break;
                }else{
                    if(moreResultsCount > 500){
                        console.log('More than 1000 results found. Stopping scraping.');
                        break;
                    }
                    moreResultsCount++;
                    console.log('More results found. Continuing scraping.',moreResultsCount);
                }

                await delay(randomDelay(50, 100));
            }

            uniqueEmails = Array.from(emails);
            const finalEmails = await saveEmailsToFirestore(uniqueEmails, name, docName);
            await driver.quit();
            return finalEmails;

        } catch (error) {
            console.error('Error extracting emails:', error);

            if (driver) {
                try {
                    await driver.quit();
                } catch (quitError) {
                    console.error('Error quitting driver:', quitError);
                }
            }

            retries--;
            if (retries === 0) {
                throw new Error('Failed after multiple attempts');
            }
            console.log(`Retrying... (${retries} attempts left)`);
        }
    }
}

// Function to locate and click the "More Results" button with retry logic
async function fetchAndClickMoreResults(driver, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const moreResultsButton = await driver.findElement(By.id('more-results'));
            await moreResultsButton.click();
            return true; // Successfully clicked
        } catch (error) {
            if (error.name === 'StaleElementReferenceError') {
                console.log(`Retrying to locate 'More Results' due to stale element... (Attempt ${attempt + 1})`);
                await delay(500);
            } else if (error.name === 'NoSuchElementError') {
                console.log('No "More Results" button found.');
                return false; // Button not found, end loop
            } else {
                throw error;
            }
        }
    }
    return false;
}

async function saveEmailsToFirestore(emails, name, docName) {
    const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);

    try {
        const allDocsSnapshot = await getDocs(collection(db, 'scrapeddata_facebook'));
        const allEmailsSet = new Set();

        allDocsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.emails) {
                data.emails.forEach(email => allEmailsSet.add(email));
            }
        });

        const currentDocSnapshot = await getDoc(docRef);
        const currentDocEmails = currentDocSnapshot.exists() ? currentDocSnapshot.data().emails || [] : [];
        const uniqueEmails = Array.from(emails).filter(email => !allEmailsSet.has(email));
        const updatedEmails = Array.from(new Set([...currentDocEmails, ...uniqueEmails]));

        await setDoc(docRef, {
            name,
            emails: updatedEmails,
            timestamp: new Date()
        });
        console.log(`Added ${uniqueEmails.length} new unique emails to Firestore with custom document ID: ${docName}`);
        return uniqueEmails;
    } catch (error) {
        console.error('Error saving emails to Firestore:', error);
    }
}

// Endpoint to download emails as Excel file
app.get('/download', async (req, res) => {
    if (!docName) return res.status(400).json({ error: 'Document name is required' });

    try {
        const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);
        const docSnapshot = await getDoc(docRef);
        if (!docSnapshot.exists()) return res.status(404).json({ error: 'Document not found' });

        const { emails, name } = docSnapshot.data();
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Emails');
        worksheet.columns = [{ header: 'Name', key: 'name', width: 30 }, { header: 'Email', key: 'email', width: 30 }];
        emails.forEach(email => worksheet.addRow({ name, email }));

        res.setHeader('Content-Disposition', `attachment; filename=${docName}_emails.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error generating Excel file:', error);
        res.status(500).json({ error: 'An error occurred while generating the Excel file' });
    }
});

// Endpoint to extract emails
app.post('/extract-emails', async (req, res) => {
    const { name, location } = req.body;
    if (!name || !docName || !location) return res.status(400).json({ error: 'Name and document name are required' });

    try {
        console.log(`Request to search emails for name: "${name}" with document: "${docName}"`);
        const emails = await searchEmails(name, docName, location);

        // Fetch the document to get the total email count
        const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);
        const docSnapshot = await getDoc(docRef);
        
        // Get existing emails in the document
        const existingEmails = docSnapshot.exists() ? docSnapshot.data().emails || [] : [];
        
        res.json({
            totalNewEmails: emails.length,
            newEmailsInserted: emails,
            totalEmailsInDoc: existingEmails.length // Add total email count in the document
        });
    } catch (error) {
        console.error('Error extracting emails:', error);
        res.status(500).json({ error: 'An error occurred while extracting emails' });
    }
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
