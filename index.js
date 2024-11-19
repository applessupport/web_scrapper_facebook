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

const docName = "Akash_Doc1411";

// Random delay generator
function randomDelay(min = 10, max = 50) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Delay helper
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to read up to 50 names from an Excel file
async function readNamesFromExcel(filePath) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1); // Get the first worksheet
    const names = [];

    worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && names.length < 50) { // Limit to 50 names
            names.push(row.getCell(1).value); // Adjust column index if necessary
        }
    });

    return names;
}

// Function to search emails for a list of names
async function searchEmails(names, docName, location) {
    let allEmails = [];

    for (const name of names) {
        console.log(`Searching emails for: ${name}`);
        let retries = 3;
        let emailsForName = [];

        while (retries > 0) {
            let driver;
            try {
                const options = new chrome.Options().addArguments('--headless');
                driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();

                const query = `${name} people email USA @gmail.com senior retired site:facebook.com location ${location}`;
                await driver.get(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
                await delay(randomDelay());

                const emails = new Set();
                const emailRegex = /(?<!\.)\b[a-zA-Z0-9._%+-]+@(gmail\.com|yahoo\.com)\b/g;

                console.log("Searching for name...",name);
                let moreResultsCount = 0;
                while (true) {
                    const pageContent = await driver.getPageSource();
                    const $ = cheerio.load(pageContent);

                    $('*').each((_, element) => {
                        const text = $(element).text();
                        const matches = text.match(emailRegex);
                        if (matches) {
                            matches.forEach(email => {
                                if (!email.startsWith('.') && !/[+&$]/.test(email)) {
                                    emails.add(email);
                                }
                            });
                        }
                    });

                    const moreResultsClicked = await fetchAndClickMoreResults(driver);
                    if (!moreResultsClicked) {
                        console.log('No more results found. Stopping scraping.');
                        break;
                    }else{
                        if(moreResultsCount > 150){
                            console.log('More than 150 results found. Stopping scraping.');
                            break;
                        }
                        moreResultsCount++;
                        console.log('More results found. Continuing scraping.',moreResultsCount);
                    }
                    await delay(randomDelay(10, 20));
                }

                emailsForName = Array.from(emails);
                allEmails = allEmails.concat(await saveEmailsToFirestore(emailsForName, name, docName));
                await driver.quit();
                break;

            } catch (error) {
                console.error('Error extracting emails:', error);
                if (driver) await driver.quit();
                retries--;
                if (retries === 0) throw new Error('Failed after multiple attempts');
                console.log(`Retrying... (${retries} attempts left)`);
            }
        }
    }
    return allEmails;
}

async function fetchAndClickMoreResults(driver, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const moreResultsButton = await driver.findElement(By.id('more-results'));
            await moreResultsButton.click();
            return true;
        } catch (error) {
            if (error.name === 'StaleElementReferenceError') {
                console.log(`Retrying to locate 'More Results' due to stale element... (Attempt ${attempt + 1})`);
                await delay(500);
            } else if (error.name === 'NoSuchElementError') {
                console.log('No "More Results" button found.');
                return false;
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



// Endpoint to extract emails using names from Excel
app.post('/extract-emails', async (req, res) => {
    const { location} = req.body;
    const excelPath ="contacts-names.xlsx";
    if (!location || !excelPath) return res.status(400).json({ error: 'Location and Excel file path are required' });

    try {
        const names = await readNamesFromExcel(excelPath);
        const emails = await searchEmails(names, docName, location);
        const docRef = doc(collection(db, 'scrapeddata_facebook'), docName);
        const docSnapshot = await getDoc(docRef);
        
        // Get existing emails in the document
        const existingEmails = docSnapshot.exists() ? docSnapshot.data().emails || [] : [];

        res.json({
            totalNewEmails: emails.length,
            newEmailsInserted: emails,
            TotalEmailsInDoc: existingEmails.length
        });
    } catch (error) {
        console.error('Error extracting emails:', error);
        res.status(500).json({ error: 'An error occurred while extracting emails' });
    }
});



app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
