/**
 * Booklet Imposer
 *
 * Arranges PDF pages for saddle-stitch booklet printing.
 * Takes content pages and arranges them on letter-size sheets
 * so that when printed duplex, folded, and stapled, the pages
 * read in the correct order.
 *
 * A5 Booklet (5.5" x 8.5"):
 * - Printed on letter paper in landscape (11" x 8.5")
 * - 2 content pages per side (4 pages per sheet)
 * - Fold in half, staple spine
 */

const BookletImposer = {
  // Page dimensions in points (1 inch = 72 points)
  dimensions: {
    // Letter paper in landscape
    sheetWidth: 792,   // 11 inches
    sheetHeight: 612,  // 8.5 inches
    // Half-letter content page
    pageWidth: 396,    // 5.5 inches
    pageHeight: 612    // 8.5 inches
  },

  /**
   * Pad page count to the nearest multiple of 4
   * Booklets require page counts divisible by 4
   * @param {number} pageCount - Current page count
   * @returns {number} Padded page count
   */
  padToMultipleOf4(pageCount) {
    return Math.ceil(pageCount / 4) * 4;
  },

  /**
   * Calculate the imposition layout for A5 booklet
   * Returns an array of sheet objects, each containing page positions
   * for front and back sides
   *
   * @param {number} totalPages - Total pages (should be multiple of 4)
   * @returns {Array} Array of sheet layouts
   *
   * Example for 8 pages:
   * Sheet 1: Front [8, 1], Back [2, 7]
   * Sheet 2: Front [6, 3], Back [4, 5]
   */
  calculateA5Layout(totalPages) {
    const sheets = [];
    const sheetCount = totalPages / 4;

    for (let i = 0; i < sheetCount; i++) {
      sheets.push({
        sheetNumber: i + 1,
        front: {
          left: totalPages - (i * 2),      // 8, 6, 4, 2...
          right: (i * 2) + 1               // 1, 3, 5, 7...
        },
        back: {
          left: (i * 2) + 2,               // 2, 4, 6, 8...
          right: totalPages - (i * 2) - 1  // 7, 5, 3, 1...
        }
      });
    }

    return sheets;
  },

  /**
   * Calculate how many sheets of paper will be needed
   * @param {number} pageCount - Number of content pages
   * @returns {number} Number of physical sheets
   */
  calculateSheetCount(pageCount) {
    const paddedCount = this.padToMultipleOf4(pageCount);
    return paddedCount / 4;
  },

  /**
   * Get the position (x offset) for left or right page placement
   * @param {string} position - 'left' or 'right'
   * @returns {number} X offset in points
   */
  getPageXOffset(position) {
    return position === 'left' ? 0 : this.dimensions.pageWidth;
  },

  /**
   * Create an imposed PDF document from content pages
   *
   * @param {Object} jsPDF - jsPDF constructor (from window.jspdf)
   * @param {Array} contentPages - Array of page data objects
   * @param {Function} renderPageFn - Function to render a page at given position
   * @returns {Object} New jsPDF document with imposed pages
   */
  createImposedDocument(jsPDF, contentPages, renderPageFn) {
    // Pad content if needed
    const paddedCount = this.padToMultipleOf4(contentPages.length);

    // Add blank pages if necessary
    while (contentPages.length < paddedCount) {
      contentPages.push({ blank: true });
    }

    // Calculate layout
    const layout = this.calculateA5Layout(paddedCount);

    // Create new document in landscape letter
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: 'letter'
    });

    // Process each sheet
    layout.forEach((sheet, sheetIndex) => {
      // Front side
      if (sheetIndex > 0) {
        doc.addPage();
      }

      // Render front left page
      const frontLeftPage = contentPages[sheet.front.left - 1];
      if (frontLeftPage && !frontLeftPage.blank) {
        renderPageFn(doc, frontLeftPage, this.getPageXOffset('left'), 0, sheet.front.left);
      }

      // Render front right page
      const frontRightPage = contentPages[sheet.front.right - 1];
      if (frontRightPage && !frontRightPage.blank) {
        renderPageFn(doc, frontRightPage, this.getPageXOffset('right'), 0, sheet.front.right);
      }

      // Back side
      doc.addPage();

      // Render back left page
      const backLeftPage = contentPages[sheet.back.left - 1];
      if (backLeftPage && !backLeftPage.blank) {
        renderPageFn(doc, backLeftPage, this.getPageXOffset('left'), 0, sheet.back.left);
      }

      // Render back right page
      const backRightPage = contentPages[sheet.back.right - 1];
      if (backRightPage && !backRightPage.blank) {
        renderPageFn(doc, backRightPage, this.getPageXOffset('right'), 0, sheet.back.right);
      }
    });

    return doc;
  },

  /**
   * Debug helper: Print the imposition layout to console
   * @param {number} pageCount - Number of pages
   */
  debugLayout(pageCount) {
    const padded = this.padToMultipleOf4(pageCount);
    const layout = this.calculateA5Layout(padded);

    console.log(`Imposition layout for ${pageCount} pages (padded to ${padded}):`);
    console.log(`Sheets needed: ${layout.length}`);
    console.log('');

    layout.forEach(sheet => {
      console.log(`Sheet ${sheet.sheetNumber}:`);
      console.log(`  Front: [${sheet.front.left}] [${sheet.front.right}]`);
      console.log(`  Back:  [${sheet.back.left}] [${sheet.back.right}]`);
    });
  }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BookletImposer };
}
