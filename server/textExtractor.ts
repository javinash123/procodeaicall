import fs from "fs";
import path from "path";

export async function extractTextFromFile(filePath: string, mimeType: string): Promise<string> {
  try {
    if (mimeType === "application/pdf") {
      return await extractFromPDF(filePath);
    } else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mimeType === "application/msword"
    ) {
      return await extractFromDOCX(filePath);
    } else if (mimeType === "text/plain") {
      return fs.readFileSync(filePath, "utf-8");
    }
    return "";
  } catch (err: any) {
    console.error(`Text extraction failed for ${filePath}:`, err.message);
    return "";
  }
}

async function extractFromPDF(filePath: string): Promise<string> {
  const pdfParse = require("pdf-parse");
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text?.trim() || "";
}

async function extractFromDOCX(filePath: string): Promise<string> {
  const mammoth = require("mammoth");
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value?.trim() || "";
}
