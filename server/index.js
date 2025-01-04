const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const dotenv = require('dotenv').config()
const { v2: cloudinary } = require('cloudinary')
const csvParser = require('csv-parser')
const { createReadStream } = require('fs')
const duckdb = require('duckdb')
const axios = require('axios')
const { GoogleGenerativeAI } = require('@google/generative-ai')

const app = express()
app.use(cors())
app.use(express.json())

const upload = multer({
  storage: multer.memoryStorage(),
})

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
})

async function generateTextViaAPI(prompt) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(prompt)
    return result.response.text()
  } catch (error) {
    console.error('Error generating text via API:', error.message)
    throw error
  }
}

app.get('/', (req, res) => {
  res.json({ message: 'Server running successfully' })
})

app.post('/upload_file', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'No file provided.' })

  try {
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          public_id: path.parse(file.originalname).name,
        },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        },
      )
      uploadStream.end(file.buffer)
    })

    res.status(200).json({
      message: 'File uploaded successfully!',
      filePath: uploadResult.secure_url,
    })
  } catch (error) {
    res
      .status(500)
      .json({ error: `Error uploading to Cloudinary: ${error.message}` })
  }
})

app.post('/generate_sql', async (req, res) => {
  const { text, filePath } = req.body
  if (!text) return res.status(400).json({ error: 'Missing text input.' })
  if (!filePath)
    return res
      .status(400)
      .json({ error: 'No file uploaded. Please upload a file first.' })

  let csvData = []
  try {
    const response = await axios.get(filePath, { responseType: 'stream' })
    await new Promise((resolve, reject) => {
      response.data
        .pipe(csvParser())
        .on('data', (row) => csvData.push(row))
        .on('end', resolve)
        .on('error', reject)
    })
  } catch (error) {
    return res
      .status(400)
      .json({ error: `Error reading CSV file: ${error.message}` })
  }

  const prompt = `You are an expert SQL generator. Given the following text request: \"${text}\" and the structure of this CSV file: ${JSON.stringify(
    csvData.slice(0, 5),
  )}, give answer in SQL query only irrespective of actual meaning and use table name as uploaded_csv and use proper alias where needed. It should contain only SQL nothing else so that it can directly run in the databse, it should not inlcude any sql keyword and any other elements.`

  try {
    const sqlQuery = await generateTextViaAPI(prompt)
    const cleanedsqlQuery1 = sqlQuery.replace(/```/g, '')
    const cleanedsqlQuery2 = cleanedsqlQuery1.replace(/sql/g, '')
    const cleanedsqlQuery3 = cleanedsqlQuery2
      .replace(/\n+/g, ' ')
      .replace(/\r+/g, ' ')
    const cleanedsqlQuery4 = cleanedsqlQuery3.trim()
    const cleanedsqlQuery = cleanedsqlQuery4.replace(
      /your_table_name/g,
      'uploaded_csv',
    )

    console.log('Cleaned SQL Query:', cleanedsqlQuery)

    const db = new duckdb.Database(':memory:')
    console.log('hey', db)

    const createTableQuery = `
      CREATE TABLE uploaded_csv AS 
      SELECT * FROM read_csv_auto('${filePath}')
    `;

    console.log(createTableQuery)

    db.all(createTableQuery, (err, rows) => {
      if (err) {
        console.error('Error executing creation query:', err.message)
        return;
      }
      console.log('Table created successfully')
    })

    db.all(cleanedsqlQuery, (err, rows) => {
      if (err) {
        console.error('Error executing query:', err.message)
        return
      }

      console.log('Query executed successfully')

      const csvContent = rows
        .map((row) =>
          Object.values(row)
            .map((value) => `"${value}"`) 
            .join(','),
        )
        .join('\n')

      const csvHeader = Object.keys(rows[0]).join(',')
      const fullCsvResult = `${csvHeader}\n${csvContent}`

      console.log('CSV Result Generated:')
      console.log(fullCsvResult)

      res.setHeader('Content-Disposition', 'attachment; filename=output.csv')
      res.setHeader('Content-Type', 'text/csv')
      res.send(fullCsvResult)
    })
  
  } catch (error) {
    res.status(500).json({
      error: `Error generating SQL or executing query: ${error.message}`,
    })
  }
})

// Server setup
const PORT = process.env.PORT || 8000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
