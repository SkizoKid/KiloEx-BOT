const fs = require("fs").promises;
const logger = require("./logger");
const { colors } = require("./colors");

class DataProcessor {
  constructor() {
    this.summary = {
      totalLines: 0,
      processedLines: 0,
      failedLines: 0,
      inputFile: "",
      outputFile: "",
    };
  }

  async readFile(inputFile) {
    try {
      const data = await fs.readFile(inputFile, "utf8");
      console.log(colors.style(`Reading file: ${inputFile}`, "info")); // Changed from logger.info
      return data.split("\n");
    } catch (error) {
      if (error.code === "ENOENT") {
        this.displayErrorSummary("File Not Found", inputFile);
      }
      throw error;
    }
  }

  processLine(line) {
    try {
      if (!line.trim()) return null;

      const userDataPart = line.split("user=")[1].split("&")[0];
      const decodedData = decodeURIComponent(userDataPart);
      const userData = JSON.parse(decodedData);

      console.log(
        colors.style(`Processing user: ${userData.username}`, "info")
      ); // Changed from logger.info
      return `${userData.id}|${userData.username}`;
    } catch (error) {
      console.log(colors.style(`Error processing line: ${line}`, "error")); // Changed from logger.error
      console.log(colors.style(error.message, "error")); // Changed from logger.error
      return null;
    }
  }

  async writeFile(outputFile, processedLines) {
    await fs.writeFile(outputFile, processedLines.join("\n") + "\n");
    console.log(
      colors.style(
        `Successfully processed and saved to ${outputFile}`,
        "success"
      )
    ); // Changed from logger.success
  }

  displayProcessingSummary() {
    const { totalLines, processedLines, inputFile, outputFile } = this.summary;

    console.log(colors.style("\nProcessing Summary:", "info"));
    console.log(colors.style("===============================", "border"));
    console.log(colors.style(`Input File: ${inputFile}`, "info"));
    console.log(colors.style(`Output File: ${outputFile}`, "info"));
    console.log(
      colors.style(`Total Lines Processed: ${processedLines.length}`, "info")
    );
    console.log(
      colors.style(
        `Successfully Processed: ${processedLines.length}`,
        "success"
      )
    );
    console.log(
      colors.style(
        `Failed Lines: ${totalLines - processedLines.length}`,
        "error"
      )
    );
    console.log(colors.style("===============================", "border"));
  }

  displayErrorSummary(errorType, details) {
    console.log(colors.style("\nError Summary:", "error"));
    console.log(colors.style("===============================", "error"));
    console.log(colors.style(`Error Type: ${errorType}`, "error"));
    console.log(colors.style(`Details: ${details}`, "error"));
    console.log(colors.style("Status: Failed", "error"));
    console.log(colors.style("===============================", "error"));
  }

  async processData(inputFile, outputFile) {
    try {
      this.summary.inputFile = inputFile;
      this.summary.outputFile = outputFile;

      const lines = await this.readFile(inputFile);
      this.summary.totalLines = lines.length;

      const processedLines = lines
        .map((line) => this.processLine(line))
        .filter((line) => line !== null);

      this.summary.processedLines = processedLines;

      await this.writeFile(outputFile, processedLines);
      this.displayProcessingSummary();
    } catch (error) {
      this.displayErrorSummary(
        error.code === "ENOENT" ? "File Not Found" : "Processing Error",
        error.message
      );
      throw error;
    }
  }
}

// Export the class and a default instance
module.exports = {
  DataProcessor,
  processData: async (inputFile, outputFile) => {
    const processor = new DataProcessor();
    return processor.processData(inputFile, outputFile);
  },
};
