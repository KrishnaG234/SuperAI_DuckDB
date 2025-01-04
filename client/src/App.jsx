import { useState } from "react";
import { useDropzone } from "react-dropzone";
import axios from "axios";
import Papa from "papaparse";
import { Download, Upload } from "lucide-react";
import ClipLoader from "react-spinners/ClipLoader";
import { FaGithub } from "react-icons/fa";

const App = () => {
  const [prompt, setPrompt] = useState("");
  const [csvData, setCsvData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [display, setDisplay] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");

  const url = "http://localhost:8000";

  const clearResults = () => {
    setCsvData([]);
    setRowsPerPage(10);
    setSearchQuery("");
    setCurrentPage(1);
  };

  const onDrop = (acceptedFiles) => {
    setIsUploading(true);
    setTimeout(() => {
      setFile(acceptedFiles[0]);
      uploadFile(acceptedFiles[0]);
      setIsUploading(false);
    }, 2000);
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: ".csv",
    maxFiles: 1,
  });

  const handleReupload = () => {
    setFile(null);
  };

  const uploadFile = async (file) => {
    if (!file) {
      throw new Error("No file provided for upload.");
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${url}/upload_file`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setCsvFile(res.data.filePath);
      return res.data;
    } catch (error) {
      console.error("Error uploading file:", error);
      if (error.res) {
        throw new Error(error.res.data.error || "File upload failed.");
      } else {
        throw new Error(
          "An unexpected error occurred while uploading the file."
        );
      }
    }
  };

  const generateSQL = async () => {
    try {
      clearResults();

      if (!prompt) {
        alert("Please enter a prompt");
        return;
      }

      if (!csvFile) {
        alert("Please upload a file");
        return;
      }

      console.log(prompt);

      setIsLoading(true);
      setDisplay(true);

      setTimeout(() => {
        const resultsSection = document.getElementById("results-section");
        if (resultsSection) {
          resultsSection.scrollIntoView({ behavior: "smooth" });
        }
      }, 500);

      const res = await axios.post(
        `${url}/generate_sql`,
        {
          text: prompt,
          filePath: csvFile,
        },
        { responseType: "blob" }
      );

      if (res.status >= 500) {
        alert(
          "Internal Server Error or prompt entered is not relevent to the file."
        );
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const csvText = reader.result;

        Papa.parse(csvText, {
          complete: (results) => {
            setCsvData(results.data);
            setIsLoading(false);
          },
        });
      };
      reader.readAsText(res.data);
    } catch (error) {
      console.error("Error fetching CSV:", error);
      setIsLoading(false);
      setDisplay(false);
    }
  };

  const handleDownload = () => {
    if (!csvData || csvData.length === 0) {
      alert("No data available to download");
      return;
    }

    try {
      const csvString = Papa.unparse(csvData);
      const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = "data.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating the download:", error);
    }
  };

  const paginate = (data) => {
    const startIndex = (currentPage - 1) * rowsPerPage + 1;
    const endIndex = startIndex + rowsPerPage;
    return data.slice(startIndex, endIndex);
  };

  const handleSearch = (event) => {
    setSearchQuery(event.target.value);
  };

  const filteredData = csvData.filter((row) =>
    row.some((cell) =>
      cell.toString().toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const paginatedData = paginate(filteredData);

  const totalPages =
    filteredData.length <= rowsPerPage
      ? 1
      : Math.ceil(filteredData.length / rowsPerPage) ;

  const getRowIndex = (rowIndex) => {
    return (currentPage - 1) * rowsPerPage + rowIndex + 1;
  };

  return (
    <div className="flex w-full h-full items-center justify-center flex-col py-10 px-10 gap-8">
      <div className="flex flex-col gap-3 mt-9 justify-center items-center">
        <h2 className="text-3xl font-bold">DuckDB Query Analytics Dashboard</h2>
        <div className="text-gray-500 text-lg">
          Analyze data using your own queries
        </div>
      </div>

      <div className="uploader-container rounded-xl w-[70vw] flex flex-col justify-center items-center p-5 border-2 border-dashed border-gray-300 bg-gray-100 shadow-lg shadow-slate-300 gap-2 mb-5">
        {!file && !isUploading && (
          <div {...getRootProps()} style={{ cursor: "pointer" }}>
            <input {...getInputProps()} />
            <div className="flex justify-center items-center text-[24px] text-[#bbb] mt-[10px]">
              <Upload color="#000000" size={36} />
            </div>
            <p style={{ color: "#555", margin: "10px 0" }}>
              Drop your CSV file here or select it manually
            </p>
          </div>
        )}

        {isUploading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              marginTop: "20px",
              height: "100%",
            }}
          >
            <ClipLoader color="#36D7B7" size={40} />
            <p style={{ color: "#555", marginTop: "10px" }}>Uploading...</p>
          </div>
        )}

        {file && !isUploading && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#555", margin: "10px 0" }}>
              Uploaded File: <strong>{file.name}</strong>
            </p>
            <button
              onClick={handleReupload}
              style={{
                padding: "10px 20px",
                border: "none",
                borderRadius: "5px",
                backgroundColor: "#36D7B7",
                color: "white",
                cursor: "pointer",
                marginTop: "10px",
              }}
            >
              Reupload
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-5 mb-1">
        <div className="rounded-xl w-[70vw] h-[30vh] rounded-xl flex border-2 p-5 bg-gray-100 shadow-lg shadow-slate-300 flex-col">
          <h2 className="text-gray-800 text-center text-lg font-semibold my-3">
            Write your query in plain language to generate SQL and analyze your
            table data
          </h2>
          <div className="flex flex-col h-full shadow-sm rounded-xl p-3 border-[1px] border-gray-300 mt-3">
            <textarea
              className="flex-1 placeholder-gray-500 focus:outline-none focus:ring-0 border-none bg-transparent"
              placeholder="Ask a question about the dataset..."
              onChange={(e) => setPrompt(e.target.value)}
              value={prompt}
            />
          </div>
        </div>

        <div className="flex-grow" />
        <div className="flex flex-row mt-0">
          <button
            className={`bg-black py-3 px-10 rounded-lg mx-2 ml-auto ${
              isLoading ? "bg-slate-400 cursor-not-allowed" : ""
            }`}
            onClick={generateSQL}
          >
            <span className="text-white text-lg">Analyze Data</span>
          </button>
        </div>
      </div>

      {display && (
        <div
          className="rounded-xl w-[70vw] h-auto flex shadow-lg shadow-slate-300 flex-col mb-5"
          id="results-section"
        >
          {isLoading ? (
            <div role="status" className="w-auto m-2 my-5 animate-pulse ">
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full mb-4"></div>
              <div className="h-6 bg-gray-200 rounded-lg dark:bg-gray-300 w-full"></div>
              <span className="sr-only">Loading...</span>
            </div>
          ) : (
            <>
              <div className="flex w-full items-center justify-between border-b p-5">
                <div className="font-bold w-auto text-lr">
                  Your Query Results
                </div>
                <div className="flex-3 ml-5">
                  <input
                    type="text"
                    className="w-full p-2 border rounded-md"
                    placeholder="Search in results..."
                    value={searchQuery}
                    onChange={handleSearch}
                  />
                </div>
              </div>

              <div className="overflow-auto h-[56vh] px-3">
                <table className="table-auto w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border-b px-4 py-3 text-left text-sm text-gray-400">
                        INDEX
                      </th>
                      {csvData &&
                        csvData.length > 0 &&
                        csvData[0].map((header, index) => (
                          <th
                            key={index}
                            className="border-b px-4 py-3 text-left text-sm text-gray-400"
                          >
                            {header}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData &&
                      paginatedData.map((row, rowIndex) => (
                        <tr key={rowIndex} className="text-gray-400">
                          <td className="px-4 py-2 text-sm text-gray-700">
                            {getRowIndex(rowIndex)}
                          </td>
                          {row.map((cell, cellIndex) => (
                            <td
                              key={cellIndex}
                              className="px-4 py-2 text-sm text-gray-700"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="p-5 flex justify-between items-center">
                <div className="flex-3">
                  <label className="mr-3">Rows per page:</label>
                  <select
                    className="border rounded-md p-2"
                    value={rowsPerPage}
                    onChange={(e) => setRowsPerPage(Number(e.target.value))}
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>

                <div className="text-center flex-1">
                  <span>
                    Page {currentPage} of {totalPages}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    className="bg-gray-200 px-3 py-1 rounded-md"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="bg-gray-200 px-3 py-1 rounded-md"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                  >
                    Next
                  </button>
                </div>
              </div>

              <div className="p-5 flex justify-center">
                <button
                  className="bg-black py-2 px-6 rounded-md text-white flex items-center gap-2"
                  onClick={handleDownload}
                >
                  <Download size={18} />
                  <span>Download</span>
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="flex justify-center items-center p-4 text-black flex-shrink-0">
        <span className="mr-2">Made by Krishna Garg</span>
        <a
          href="https://github.com/KrishnaG234"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaGithub size={24} />
        </a>
      </div>
      {/* </div> */}
    </div>
  );
};

export default App;
