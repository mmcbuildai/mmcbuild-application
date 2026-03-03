import { jsPDF } from "jspdf";

interface CertificateData {
  recipientName: string;
  courseTitle: string;
  certNumber: string;
  issuedAt: string;
  courseDifficulty: string;
  courseCategory: string;
}

export function generateCertificatePdf(data: CertificateData): Buffer {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Background: white
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Purple gradient border (simulated with rectangles)
  doc.setFillColor(124, 58, 237); // purple-600
  doc.rect(0, 0, pageWidth, 8, "F");
  doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
  doc.rect(0, 0, 8, pageHeight, "F");
  doc.rect(pageWidth - 8, 0, 8, pageHeight, "F");

  // Inner border
  doc.setDrawColor(167, 139, 250); // purple-400
  doc.setLineWidth(0.5);
  doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

  // Header: MMC Build
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(124, 58, 237);
  doc.text("MMC BUILD", pageWidth / 2, 30, { align: "center" });

  // Certificate title
  doc.setFontSize(32);
  doc.setTextColor(31, 41, 55); // gray-800
  doc.text("Certificate of Completion", pageWidth / 2, 50, {
    align: "center",
  });

  // Decorative line
  doc.setDrawColor(124, 58, 237);
  doc.setLineWidth(1);
  doc.line(pageWidth / 2 - 60, 56, pageWidth / 2 + 60, 56);

  // "This certifies that"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text("This certifies that", pageWidth / 2, 72, { align: "center" });

  // Recipient name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(31, 41, 55);
  doc.text(data.recipientName, pageWidth / 2, 88, { align: "center" });

  // "has successfully completed"
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(107, 114, 128);
  doc.text("has successfully completed the course", pageWidth / 2, 102, {
    align: "center",
  });

  // Course title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(124, 58, 237);
  doc.text(data.courseTitle, pageWidth / 2, 118, { align: "center" });

  // Difficulty + category
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(107, 114, 128);
  doc.text(
    `${data.courseDifficulty} | ${data.courseCategory}`,
    pageWidth / 2,
    130,
    { align: "center" }
  );

  // Date
  const formattedDate = new Date(data.issuedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  doc.setFontSize(11);
  doc.text(`Issued: ${formattedDate}`, pageWidth / 2, 148, {
    align: "center",
  });

  // Certificate number
  doc.setFontSize(9);
  doc.setTextColor(156, 163, 175); // gray-400
  doc.text(`Certificate No: ${data.certNumber}`, pageWidth / 2, 158, {
    align: "center",
  });

  // Footer
  doc.setFontSize(8);
  doc.text(
    "MMC Build Pty Ltd | ABN 99 691 530 426 | mmcbuild.com.au",
    pageWidth / 2,
    pageHeight - 18,
    { align: "center" }
  );

  // Return as Buffer
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
