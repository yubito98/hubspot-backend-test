const axios = require('axios');
const csvtojson = require('csvtojson');
require('dotenv').config();

const PRIVATE_KEY = process.env.PRIVATE_KEY;

const CSVcontacts = './contacts.csv';
const CSVdeals = './deals.csv';

const headers = {
'Authorization': `Bearer ${PRIVATE_KEY}`,
'Content-Type': 'application/json'
}

async function createRecords(endpoint, data) {
    try {
        const response = await axios.post(endpoint, { inputs: data }, { headers });
        console.log("Batch created successfully");
    } catch (error) {
        console.error("Error creating batch:", error);
    }
}

async function processContacts(jsonData) {
    const batchSize = 100;
    for (let i = 0; i < jsonData.length; i += batchSize) {
        const chunk = jsonData.slice(i, i + batchSize);
        const data = chunk.map(contact =>{
            const date = new Date(contact.last_purchase_date);
            date.setUTCHours(0, 0, 0, 0);
            contact.last_purchase_date = date.getTime();
            return {properties: contact}
        } );
        await createRecords('https://api.hubapi.com/crm/v3/objects/contacts/batch/create', data);
    }
}

async function processDeals(jsonData, contactsObject) {
    const batchSize = 100;
    for (let i = 0; i < jsonData.length; i += batchSize) {
        const chunk = jsonData.slice(i, i + batchSize);
        const data = await Promise.all(chunk.map(async deal => {
            const date = new Date(deal.closedate);
            date.setUTCHours(0, 0, 0, 0);
            deal.closedate = date.getTime();
            if (deal.dealstage == "Closed Won") {
                deal.dealstage = "180390021";
            } else if (deal.dealstage == "Pending Response") {
                deal.dealstage = "180390019";
            } else if (deal.dealstage == "Pending Contract") {
                deal.dealstage = "180390020";
            const associatedContact = contactsObject.find(contact => contact.firstname === deal.associated_contact);
            if (associatedContact) {
                // Add associations to contacts
                const associations = [{
                    to:{
                        id: associatedContact.hs_object_id
                    },
                    types: [
                        {
                          "associationCategory": "HUBSPOT_DEFINED",
                          "associationTypeId": 3
                        } ]
                }];
                return { properties: deal, [associations]: { associatedVids: [associatedContact.hs_object_id] } };
            } else {
                console.warn(`No contact found for deal with associated_contact: ${deal.associated_contact}`);
                return null;
            }
        }));
        const validData = data.filter(Boolean);
        await createRecords('https://api.hubapi.com/crm/v3/objects/deals/batch/create', validData);
    }
}


csvtojson()
.fromFile(CSVcontacts)
.then((contactsObject) => { processContacts(contactsObject) })
.catch((err) => {
console.error('Error converting CSV to JSON:', err);
});

csvtojson()
.fromFile(CSVdeals)
.then((dealsObject) => { processDeals(dealsObject) })
.catch((err) => {
    console.error('Error converting CSV to JSON:', err);
});





