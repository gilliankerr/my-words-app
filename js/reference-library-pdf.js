/**
 * PDF Generator for Reference Library
 * Generates a print-ready PDF with proper page numbers from the HTML content
 */

class ReferenceLibraryPDF {
    constructor(format = 'letter', source = null) {
        // Optional isolated immutable source; legacy callers retain their existing behaviour.
        this.source = source;
        // Page dimensions based on format
        if (format === 'a5') {
            // A5: 148mm x 210mm
            this.pageWidth = 148 * 2.83465;  // Convert mm to points
            this.pageHeight = 210 * 2.83465;
            this.fontSize = {
                title: 15,
                sectionHeader: 12,
                subsectionHeader: 10,
                body: 9,
                pageNumber: 8
            };
        } else {
            // Letter: 8.5" x 11"
            this.pageWidth = 8.5 * 72;
            this.pageHeight = 11 * 72;
            this.fontSize = {
                title: 19,
                sectionHeader: 15,
                subsectionHeader: 11,
                body: 10,
                pageNumber: 9
            };
        }

        this.format = format;
        if (source) this.fontSize = { title: 20, sectionHeader: 18, subsectionHeader: 16, body: 16, pageNumber: 9 };

        // Margins in points
        this.margins = {
            top: source ? 48 : 40,
            bottom: 50,
            left: 40,
            right: 40
        };

        this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
        this.contentHeight = this.pageHeight - this.margins.top - this.margins.bottom;

        this.doc = null;
        this.currentPage = 0;
        this.currentY = 0;
        this.preloadedImages = new Map(); // Store pre-loaded images

        // Booklet mode properties
        this.xOffset = 0;              // X offset for booklet positioning
        this.bookletMode = false;      // Whether we're in booklet rendering mode
        this.targetPage = 0;           // Which page to render in booklet mode
        this.renderingEnabled = true;  // Whether to actually draw (for booklet page targeting)

        // Running header tracking
        this.currentSectionName = '';  // Current section for running headers

        // Partner Guide content (fetched from API)
        this.partnerGuideContent = null;

        // Last revised date (fetched from API)
        this.lastRevisedDate = null;

        // Group tracking for section headers
        this.currentGroup = null;

        // Group boundaries - maps section IDs to their group names
        // Used to insert group headers when transitioning between groups
        // Order: Family & People → My Words → Communication → Health & Body → Daily Life
        //        → Toronto & Travel → Time & Reference → Life & Activities → Word Building → Shopping
        this.groupBoundaries = {
            'family': 'Family & People',
            'people': 'Family & People',
            'notes': 'My Words',
            'greetings': 'Communication',
            'questions': 'Communication',
            'phrases': 'Communication',
            'feelings': 'Communication',
            'body': 'Health & Body',
            'health': 'Health & Body',
            'medical': 'Health & Body',
            'emergency': 'Health & Body',
            'food': 'Daily Life',
            'home': 'Daily Life',
            'clothing': 'Daily Life',
            'places': 'Toronto & Travel',
            'ttc': 'Toronto & Travel',
            'transportation': 'Toronto & Travel',
            'time': 'Time & Reference',
            'numbers': 'Time & Reference',
            'weather': 'Time & Reference',
            'colours': 'Time & Reference',
            'work': 'Life & Activities',
            'school': 'Life & Activities',
            'hobbies': 'Life & Activities',
            'technology': 'Life & Activities',
            'actions': 'Word Building',
            'descriptions': 'Word Building',
            'shopping': 'Shopping',
            'shopping-list': 'Shopping'
        };
    }

    /**
     * Add a group header (larger than section headers, marks major divisions)
     * @param {string} groupName - The name of the group
     */
    addGroupHeader(groupName) {
        // Check if we need a page break (group headers need more space)
        this.checkPageBreak(50);

        // Add extra space before group header
        if (this.currentY > this.margins.top + 30) {
            this.currentY += 15;
        }

        if (this.renderingEnabled) {
            // Draw group header - larger and bolder than section headers
            const headerFontSize = this.fontSize.sectionHeader + 2;
            this.doc.setFontSize(headerFontSize);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(0, 0, 0);

            // Center the group name
            const centerX = this.xOffset + this.pageWidth / 2;
            this.doc.text(groupName.toUpperCase(), centerX, this.currentY, { align: 'center' });

            // Draw double line underneath for emphasis
            const textWidth = this.doc.getTextWidth(groupName.toUpperCase());
            const lineStartX = centerX - textWidth / 2 - 20;
            const lineEndX = centerX + textWidth / 2 + 20;

            this.doc.setDrawColor(60, 60, 60);
            this.doc.setLineWidth(1);
            this.doc.line(lineStartX, this.currentY + 5, lineEndX, this.currentY + 5);
            this.doc.setLineWidth(0.5);
            this.doc.line(lineStartX, this.currentY + 8, lineEndX, this.currentY + 8);
        }

        this.currentY += 20;
    }

    /**
     * Check if entering a new group and add group header if needed
     * @param {string} sectionId - The section ID being rendered
     */
    checkAndAddGroupHeader(sectionId) {
        const newGroup = this.groupBoundaries[sectionId];
        if (newGroup && newGroup !== this.currentGroup) {
            this.addGroupHeader(newGroup);
            this.currentGroup = newGroup;
        }
    }

    /**
     * Fetch Partner Guide content from the API
     * Falls back to default content if API is unavailable
     */
    async fetchPartnerGuide() {
        if (this.source) {
            if (!this.source.guide?.content) throw new Error('Owned Partner Guide is required for this edition.');
            this.partnerGuideContent = this.source.guide;
            return;
        }
        console.group('Reference Library PDF: fetchPartnerGuide');
        try {
            console.log('Fetching from /api/settings/partner-guide with credentials...');
            const response = await fetch('/api/settings/partner-guide', {
                credentials: 'include'
            });
            console.log('Response status:', response.status, response.statusText);

            if (!response.ok) {
                console.warn('Partner Guide API returned', response.status);
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            console.log('API response data:', {
                success: data.success,
                hasContent: !!data.content,
                contentName: data.content?.name,
                contentType: data.content?.type
            });

            if (data.success && data.content) {
                this.partnerGuideContent = data.content;
                console.log('Partner Guide loaded from API - name:', data.content.name);
                console.groupEnd();
                return;
            } else {
                console.warn('API returned success=false or no content');
            }
        } catch (error) {
            console.warn('Failed to fetch Partner Guide, using fallback:', error.message);
        }

        // Fallback content
        console.log('Using FALLBACK partner guide (default)');
        this.partnerGuideContent = this.getDefaultPartnerGuide();
        console.groupEnd();
    }

    /**
     * Fetch the last revised date from the API
     * This is when the user last customized their Reference Library
     */
    async fetchLastRevisedDate() {
        if (this.source) {
            if (!this.source.revisedDate) throw new Error('Edition revised date is required.');
            this.lastRevisedDate = this.source.revisedDate;
            return;
        }
        try {
            const response = await fetch('/api/reference-library/last-revised');
            if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
            }

            const data = await response.json();
            if (data.success && data.lastRevised) {
                this.lastRevisedDate = data.lastRevised;
                return;
            }
        } catch (error) {
            console.warn('Failed to fetch last revised date:', error.message);
        }

        // No date available (user hasn't customized)
        this.lastRevisedDate = null;
    }

    /**
     * Get default Partner Guide content (fallback when API is unavailable)
     */
    getDefaultPartnerGuide() {
        return {
            name: 'Communication Partner Guide',
            type: 'partner-guide',
            content: [
                {
                    type: 'intro-paragraph',
                    text: 'I have a form of aphasia. I understand everything you say, but finding and saying words is difficult for me.'
                },
                {
                    type: 'guide-section',
                    subtitle: 'When talking with me',
                    items: [
                        'Give me time to find the right word',
                        'Be patient — I know what I want to say',
                        'Speak normally to me — I understand you',
                        'Watch where I point — I may show you the word'
                    ]
                },
                {
                    type: 'closing-text',
                    text: 'Thank you for your patience and understanding.'
                }
            ]
        };
    }

    /**
     * Get sections in PDF order (shopping-list moved to end for printed booklet)
     * @returns {Array} Array of section elements in PDF order
     */
    getSectionsInPdfOrder() {
        const allSections = Array.from((this.source?.printRoot || document).querySelectorAll('.section'));
        if (this.source) return allSections;

        // Separate shopping-list from other sections
        const shoppingList = allSections.find(s => s.id === 'shopping-list');
        const otherSections = allSections.filter(s => s.id !== 'shopping-list');

        // Put shopping-list at the end (before back cover in printed booklet)
        if (shoppingList) {
            return [...otherSections, shoppingList];
        }
        return otherSections;
    }

    /**
     * Pre-load all images used in the reference library
     * Converts images to base64 data URLs for jsPDF compatibility
     * @param {Function} onProgress - Optional callback for progress updates (0-1)
     */
    async preloadImages(onProgress) {
        if (this.source?.noNetwork) return;
        const definitions = window.LabelledImage?.definitions || {};
        const imageIds = Object.keys(definitions);
        const total = imageIds.length;
        let loaded = 0;

        console.log('Starting image preload for:', imageIds);

        // Process images one at a time to allow UI updates
        for (const imageId of imageIds) {
            await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    try {
                        // Downscale large images to reduce PDF file size
                        const MAX_DIMENSION = 1200;
                        let width = img.naturalWidth;
                        let height = img.naturalHeight;

                        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
                            const scale = MAX_DIMENSION / Math.max(width, height);
                            width = Math.round(width * scale);
                            height = Math.round(height * scale);
                        }

                        // Convert image to base64 data URL using canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);

                        // Use JPEG with 85% quality for smaller file size
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

                        // Store both the data URL and dimensions
                        this.preloadedImages.set(imageId, {
                            dataUrl: dataUrl,
                            width: width,
                            height: height
                        });
                        console.log(`Successfully loaded: ${imageId} (${img.naturalWidth}x${img.naturalHeight} → ${width}x${height})`);
                        resolve();
                    } catch (e) {
                        console.error(`Failed to convert image ${imageId} to base64:`, e);
                        resolve();
                    }
                };
                img.onerror = (e) => {
                    console.error(`Failed to load image: ${imageId}`, e);
                    resolve();
                };
                img.src = `images/${imageId}.png`;
            });

            loaded++;
            if (onProgress) {
                onProgress(loaded / total);
            }
            // Yield to UI between images to prevent freezing
            await new Promise(r => setTimeout(r, 0));
        }

        console.log('Image preload complete. Loaded:', this.preloadedImages.size, 'of', total, 'images');
    }

    /**
     * Initialize the PDF document
     */
    initDocument() {
        this.doc = new jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: [this.pageWidth, this.pageHeight],
            compress: true
        });

        // Set document metadata for accessibility
        this.doc.setProperties({
            title: 'Communication Book',
            subject: 'Communication vocabulary reference',
            author: 'Communication Notes App',
            keywords: 'vocabulary, reference, communication, PPA',
            language: 'en-CA'
        });

        this.currentPage = 1;
        this.currentY = this.margins.top;

        this.doc.setFont('helvetica', 'normal');
    }

    /**
     * Add a new page
     */
    addPage() {
        // Add page number to current page before adding new one
        this.addPageNumber();

        if (this.bookletMode) {
            // In booklet mode, just track page number without adding actual page
            this.currentPage++;
            this.currentY = this.margins.top;
            // Update rendering flag based on target page
            this.renderingEnabled = (this.currentPage === this.targetPage);
        } else {
            this.doc.addPage([this.pageWidth, this.pageHeight]);
            this.currentPage++;
            this.currentY = this.margins.top;
        }

        // Add running header to new page
        this.addRunningHeader();
    }

    /**
     * Check if we need a new page
     */
    checkPageBreak(neededHeight) {
        if (this.currentY + neededHeight > this.pageHeight - this.margins.bottom) {
            this.addPage();
            return true;
        }
        return false;
    }

    /**
     * Add running header at top of page (shows current section)
     */
    addRunningHeader() {
        if (!this.renderingEnabled || !this.currentSectionName || this.currentPage <= 1) return;

        this.doc.setFontSize(this.fontSize.pageNumber);
        this.doc.setFont('helvetica', 'italic');
        this.doc.setTextColor(120, 120, 120);

        // Left side: section name, Right side: page number
        const y = 20;
        this.doc.text(this.currentSectionName, this.xOffset + this.margins.left, y);
        this.doc.text(this.currentPage.toString(), this.xOffset + this.pageWidth - this.margins.right, y, { align: 'right' });

        // Reset text style
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0, 0, 0);
    }

    /**
     * Add page number to current page
     */
    addPageNumber() {
        if (!this.renderingEnabled) return;

        this.doc.setFontSize(this.fontSize.pageNumber);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(100, 100, 100);

        const y = this.pageHeight - 25;

        // Just the page number centered at bottom (running header has section name)
        this.doc.text(this.currentPage.toString(), this.xOffset + this.pageWidth / 2, y, { align: 'center' });

        // Reset text colour
        this.doc.setTextColor(0, 0, 0);
    }

    /**
     * Add the title at top of first page (no page break - content continues)
     */
    addTitlePage(userName = null) {
        if (this.source) {
            this.currentSectionName = '';
            if (this.source.tableOfContents) {
                this.addSourceText(this.source.title || 'Communication book', 18, true);
                this.addSourceText('Saved: ' + String(this.source.revisedDate).slice(0, 10), 9);
                this.currentY += 8;
                this.addSourceText('Contents', 12, true);
                const entries = this.getSectionsInPdfOrder(), gap = 16, width = (this.contentWidth - gap) / 2;
                const rows = Math.ceil(entries.length / 2), startY = this.currentY + 4;
                const size = 10, leading = 13;
                this.doc.setFontSize(size); this.doc.setFont('helvetica', 'normal');
                const columns = [entries.slice(0, rows), entries.slice(rows)];
                for (const [column, items] of columns.entries()) {
                    let y = startY, x = this.xOffset + this.margins.left + column * (width + gap);
                    for (const entry of items) {
                        const label = entry.querySelector('.section-header').textContent.trim();
                        const lines = this.doc.splitTextToSize(label, width - 24);
                        if (y + lines.length * leading > this.pageHeight - this.margins.bottom) throw new Error('Contents needs a one-page layout review.');
                        if (this.renderingEnabled) {
                            lines.forEach((line, i) => this.doc.text(line, x, y + i * leading));
                            this.doc.text(String(this.sectionPageNumbers?.[entry.id] || ''), x + width, y, { align: 'right' });
                        }
                        y += lines.length * leading + 7;
                    }
                }
                this.addPage();
                return;
            }
            if (this.source.titleHighlight) this.addSourcePhraseItems([{ text: this.source.title, highlight: true }]); else this.addSourceText(this.source.title || 'Fictional Communication Book', 20, true);
            this.currentY += 12;
            this.addSourceText('Saved: ' + new Date(this.source.revisedDate).toLocaleDateString('en-CA'), 11);

            this.currentY += 12;
            if (!this.source.excludeRescueHeading) this.addSourceText('Rescue words', 18, true);
            for (const phrase of this.source.rescue || []) { if (typeof phrase === 'string') this.addSourceText(phrase, 16); else if (phrase.highlight) this.addSourcePhraseItems([phrase]); else this.addSourceText(phrase.text, 16); }
            this.addPage();
            return;
        }
        if (!this.renderingEnabled) {
            // Still update currentY for layout calculations
            this.currentY = this.margins.top + 20;
            if (userName) this.currentY += 25;
            this.currentY += 30;
            return;
        }

        const centerX = this.xOffset + this.pageWidth / 2;

        // Title near top of page
        this.currentY = this.margins.top + 20;

        this.doc.setFontSize(this.fontSize.title + 6);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text('Communication Book', centerX, this.currentY, { align: 'center' });

        // Add user's name if provided
        if (userName) {
            this.currentY += 25;
            this.doc.setFontSize(this.fontSize.title);
            this.doc.setFont('helvetica', 'normal');
            this.doc.text(userName, centerX, this.currentY, { align: 'center' });
        }

        this.currentY += 30;

        // Add emergency quick-reference box on title page
        this.addFrontCoverEmergencyBox();
    }

    /**
     * Add emergency quick-reference box to front cover
     * Provides immediate access to critical phrases without flipping pages
     */
    addFrontCoverEmergencyBox() {
        if (!this.renderingEnabled) {
            // Update Y position for layout calculation
            this.currentY += 100;
            return;
        }

        const boxWidth = this.contentWidth - 40;
        const boxHeight = 85;
        const boxX = this.xOffset + this.margins.left + 20;

        // Add some space before the box
        this.currentY += 15;

        // Draw box with grey background
        this.doc.setFillColor(240, 240, 240);
        this.doc.setDrawColor(80, 80, 80);
        this.doc.setLineWidth(1.5);
        this.doc.rect(boxX, this.currentY, boxWidth, boxHeight, 'FD');

        // Emergency header
        this.doc.setFontSize(this.fontSize.sectionHeader);
        this.doc.setFont('helvetica', 'bold');
        this.doc.setTextColor(0, 0, 0);
        const headerY = this.currentY + 18;
        this.doc.text('EMERGENCY', boxX + boxWidth / 2, headerY, { align: 'center' });

        // Emergency phrases
        this.doc.setFontSize(this.fontSize.body + 1);
        this.doc.setFont('helvetica', 'normal');
        const phrases = [
            'Call 911',
            'I need help',
            'I have aphasia — I understand you but have difficulty speaking'
        ];

        let phraseY = headerY + 18;
        for (const phrase of phrases) {
            this.doc.text('• ' + phrase, boxX + 15, phraseY);
            phraseY += 14;
        }

        this.currentY += boxHeight + 15;
    }

    /**
     * Add a section header
     */
    addSectionHeader(title, followingHeight = 38) {
        if (this.source) {
            this.currentSectionName = title;
            this.doc.setFontSize(this.fontSize.sectionHeader);
            this.doc.setFont('helvetica', 'bold');
            const lines = this.doc.splitTextToSize(title, this.contentWidth - 10);
            this.checkPageBreak(lines.length * this.fontSize.sectionHeader * 1.5 + (this.source.compact ? 10 : 22) + followingHeight);
            this.currentY += this.source.compact ? 5 : 12;
            this.addSourceText(title, this.fontSize.sectionHeader, true);
            this.currentY += this.source.compact ? 5 : 10;
            return;
        }
        // Track current section for running headers
        this.currentSectionName = title;

        this.checkPageBreak(30);

        // Add some space before section
        if (this.currentY > this.margins.top + 20) {
            this.currentY += 10;
        }

        if (this.renderingEnabled) {
            // Clean style: bold text with underline (no heavy background bar)
            this.doc.setFontSize(this.fontSize.sectionHeader);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(0, 0, 0);
            this.doc.text(title.toUpperCase(), this.xOffset + this.margins.left, this.currentY);

            // Draw underline
            this.doc.setDrawColor(100, 100, 100);
            this.doc.setLineWidth(0.5);
            this.doc.line(
                this.xOffset + this.margins.left,
                this.currentY + 3,
                this.xOffset + this.margins.left + this.contentWidth,
                this.currentY + 3
            );
        }
        this.currentY += 15;
    }

    /**
     * Add a subsection header
     */
    addSubsectionHeader(title, followingHeight = 38) {
        if (this.source) {
            this.doc.setFontSize(this.fontSize.subsectionHeader);
            this.doc.setFont('helvetica', 'bold');
            const lines = this.doc.splitTextToSize(title, this.contentWidth - 10);
            this.checkPageBreak(lines.length * this.fontSize.subsectionHeader * 1.5 + 6 + (this.source.compact ? 4 : 12) + followingHeight);
            this.currentY += 6;
            this.addSourceText(title, this.fontSize.subsectionHeader, true);
            this.currentY += this.source.compact ? 4 : 12;
            return;
        }
        this.checkPageBreak(20);

        this.currentY += 6;

        if (this.renderingEnabled) {
            // Use black text for B&W printing
            this.doc.setFontSize(this.fontSize.subsectionHeader);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(0, 0, 0);
            this.doc.text(title, this.xOffset + this.margins.left, this.currentY);

            // Underline - dark grey
            const textWidth = this.doc.getTextWidth(title);
            this.doc.setDrawColor(100, 100, 100);
            this.doc.line(this.xOffset + this.margins.left, this.currentY + 3,
                         this.xOffset + this.margins.left + textWidth, this.currentY + 3);
        }

        this.currentY += 10;
    }

    /**
     * Add a word list (displayed in three columns for density)
     */
    addWordList(words) {
        this.doc.setFontSize(this.fontSize.body);
        this.doc.setFont('helvetica', 'normal');

        const numColumns = 3;
        const columnGap = 15;
        const columnWidth = (this.contentWidth - (columnGap * (numColumns - 1))) / numColumns;
        const lineHeight = 12;

        // Process words in groups of 3 for three columns
        for (let i = 0; i < words.length; i += numColumns) {
            this.checkPageBreak(lineHeight);

            if (this.renderingEnabled) {
                for (let col = 0; col < numColumns && i + col < words.length; col++) {
                    const word = words[i + col];
                    const x = this.xOffset + this.margins.left + (col * (columnWidth + columnGap));
                    // Use splitTextToSize for long words instead of truncation
                    const lines = this.doc.splitTextToSize(word, columnWidth - 2);
                    this.doc.text(lines[0], x, this.currentY);
                }
            }
            this.currentY += lineHeight;
        }

        this.currentY += 4;
    }

    /**
     * Add a phrase list (one per line)
     */
    addPhraseList(phrases) {
        if (this.source) {
            for (const phrase of phrases) this.addSourceText(phrase, this.fontSize.body);
            this.currentY += 3;
            return;
        }
        this.doc.setFontSize(this.fontSize.body);
        this.doc.setFont('helvetica', 'normal');

        for (const phrase of phrases) {
            this.checkPageBreak(12);

            // Wrap long phrases
            const lines = this.doc.splitTextToSize('• ' + phrase, this.contentWidth - 10);
            for (let i = 0; i < lines.length; i++) {
                if (this.renderingEnabled) {
                    this.doc.text(lines[i], this.xOffset + this.margins.left + (i > 0 ? 10 : 0), this.currentY);
                }
                this.currentY += 11;
            }
        }

        this.currentY += 3;
    }

    /**
     * Add an index list (displayed in three columns for density)
     * Used for the Alphabetical Index section - no truncation
     */
    addIndexList(entries) {
        this.doc.setFontSize(this.fontSize.body - 1); // Slightly smaller for index
        this.doc.setFont('helvetica', 'normal');

        const numColumns = 3;
        const columnGap = 10;
        const columnWidth = (this.contentWidth - (columnGap * (numColumns - 1))) / numColumns;
        const lineHeight = 10;

        // Process entries in groups of 3 for three columns
        for (let i = 0; i < entries.length; i += numColumns) {
            this.checkPageBreak(lineHeight);

            if (this.renderingEnabled) {
                for (let col = 0; col < numColumns && i + col < entries.length; col++) {
                    const entry = entries[i + col];
                    const x = this.xOffset + this.margins.left + (col * (columnWidth + columnGap));
                    // Use splitTextToSize for wrapping instead of truncation
                    const lines = this.doc.splitTextToSize(entry, columnWidth - 2);
                    this.doc.text(lines[0], x, this.currentY);
                }
            }
            this.currentY += lineHeight;
        }

        this.currentY += 3;
    }

    /**
     * Add a contacts list (from My People section)
     * Formats: Name (Relationship) - Phone, with graceful fallbacks
     */
    addContactsList(contactCards) {
        this.doc.setFontSize(this.fontSize.body);
        this.doc.setFont('helvetica', 'normal');

        for (const card of contactCards) {
            const name = card.querySelector('.contact-name')?.textContent?.trim();
            if (!name) continue; // Skip cards without names

            const relationship = card.querySelector('.contact-relationship')?.textContent?.trim();
            const phone = card.querySelector('.contact-phone')?.textContent?.trim();

            // Build formatted string: Name (Relationship) - Phone
            let contactText = name;
            if (relationship) {
                contactText += ' (' + relationship + ')';
            }
            if (phone) {
                contactText += ' — ' + phone;
            }

            this.checkPageBreak(12);

            // Wrap long contact entries
            const lines = this.doc.splitTextToSize('• ' + contactText, this.contentWidth - 10);
            for (let i = 0; i < lines.length; i++) {
                if (this.renderingEnabled) {
                    this.doc.text(lines[i], this.xOffset + this.margins.left + (i > 0 ? 10 : 0), this.currentY);
                }
                this.currentY += 11;
            }
        }

        this.currentY += 3;
    }

    /**
     * Add an info box (like emergency alert)
     * B&W compatible - uses grey fills and black borders
     */
    addInfoBox(lines, isEmergency = false) {
        const boxHeight = (lines.length * 14) + 20;
        this.checkPageBreak(boxHeight);

        if (this.renderingEnabled) {
            // Draw box - B&W compatible
            if (isEmergency) {
                this.doc.setFillColor(230, 230, 230); // Light grey for emergency
                this.doc.setDrawColor(0, 0, 0); // Black border
                this.doc.setLineWidth(2); // Thicker border for emphasis
            } else {
                this.doc.setFillColor(245, 245, 245); // Very light grey
                this.doc.setDrawColor(100, 100, 100); // Dark grey border
                this.doc.setLineWidth(1);
            }

            this.doc.rect(this.xOffset + this.margins.left, this.currentY, this.contentWidth, boxHeight, 'FD');

            this.currentY += 15;
            this.doc.setFontSize(this.fontSize.body);
            this.doc.setFont('helvetica', 'bold');
            this.doc.setTextColor(0, 0, 0);

            for (const line of lines) {
                this.doc.text(line, this.xOffset + this.pageWidth / 2, this.currentY, { align: 'center' });
                this.currentY += 14;
            }

            this.doc.setFont('helvetica', 'normal');
            this.currentY += 10;
        } else {
            // Just update Y position for layout calculation
            this.currentY += 15;
            this.currentY += lines.length * 14;
            this.currentY += 10;
        }
    }

    /**
     * Add placeholder for diagram
     * B&W compatible
     */
    addDiagramPlaceholder(title) {
        this.checkPageBreak(80);

        if (this.renderingEnabled) {
            // Draw placeholder box - light grey fill, dark grey border
            this.doc.setFillColor(245, 245, 245);
            this.doc.setDrawColor(150, 150, 150);
            this.doc.setLineWidth(1);
            this.doc.rect(this.xOffset + this.margins.left, this.currentY, this.contentWidth, 60, 'FD');

            // Add text - dark grey
            this.doc.setFontSize(this.fontSize.body);
            this.doc.setTextColor(80, 80, 80);
            this.doc.text(title, this.xOffset + this.pageWidth / 2, this.currentY + 30, { align: 'center' });
            this.doc.text('[Diagram to be inserted]', this.xOffset + this.pageWidth / 2, this.currentY + 45, { align: 'center' });

            this.doc.setTextColor(0, 0, 0);
        }
        this.currentY += 70;
    }

    /**
     * Add labelled image to PDF
     * Uses pre-loaded images (base64 data URLs) for reliable rendering
     * @param {string} imageId - The image identifier
     * @param {HTMLImageElement} imgElement - Unused, kept for compatibility
     */
    async addLabelledImage(imageId, imgElement) {
        // Get pre-loaded image data (contains dataUrl, width, height)
        const preloadedData = this.preloadedImages.get(imageId);

        console.log(`addLabelledImage called for: ${imageId}, preloaded: ${!!preloadedData}, renderingEnabled: ${this.renderingEnabled}`);

        // If image wasn't preloaded, show placeholder
        if (!preloadedData || !preloadedData.dataUrl) {
            console.warn(`Image not preloaded: ${imageId}`);
            this.addDiagramPlaceholder(imageId);
            return;
        }

        // Calculate image dimensions to fit page
        const maxWidth = this.contentWidth;
        const maxHeight = this.contentHeight * 0.6; // Use up to 60% of page height

        let imgWidth = maxWidth;
        let imgHeight = maxWidth; // Default square

        // Use stored dimensions for aspect ratio
        if (preloadedData.width && preloadedData.height) {
            const ratio = preloadedData.height / preloadedData.width;
            imgHeight = imgWidth * ratio;
            if (imgHeight > maxHeight) {
                imgHeight = maxHeight;
                imgWidth = imgHeight / ratio;
            }
        }

        // Check if we need a page break
        const pageBreakOccurred = this.checkPageBreak(imgHeight + 50);

        // Add extra top padding after page break to prevent image clipping at top margin
        if (pageBreakOccurred) {
            this.currentY += 10;
        }

        // Add the image if rendering is enabled
        if (this.renderingEnabled) {
            console.log(`RENDERING IMAGE: ${imageId} on page ${this.currentPage}, targetPage: ${this.targetPage}`);
            try {
                this.doc.addImage(
                    preloadedData.dataUrl,
                    'JPEG',
                    this.xOffset + this.margins.left + (this.contentWidth - imgWidth) / 2,
                    this.currentY,
                    imgWidth,
                    imgHeight
                );

                // Add labels on top of image
                this.addLabelsToImage(imageId, this.currentY, imgWidth, imgHeight);
                console.log(`Successfully added image ${imageId} to PDF`);
            } catch (e) {
                console.error(`Failed to add image ${imageId} to PDF:`, e);
                // Draw placeholder on error
                this.doc.setFillColor(245, 245, 245);
                this.doc.rect(this.xOffset + this.margins.left, this.currentY, this.contentWidth, 60, 'FD');
            }
        } else {
            console.log(`SKIPPING IMAGE: ${imageId} - renderingEnabled is false (currentPage: ${this.currentPage}, targetPage: ${this.targetPage})`);
        }
        this.currentY += imgHeight + 10;
    }

    /**
     * Add labels overlay to image in PDF
     */
    addLabelsToImage(imageId, imageTop, imageWidth, imageHeight) {
        if (!this.renderingEnabled) return;

        // Get label definitions
        const definitions = window.LabelledImage?.definitions || {};
        const def = definitions[imageId];

        if (!def || !def.labels) {
            return;
        }

        const imageLeft = this.xOffset + this.margins.left + (this.contentWidth - imageWidth) / 2;
        const fontSize = (this.format === 'a5' || this.format === 'booklet') ? 6 : 7;

        this.doc.setFontSize(fontSize);
        this.doc.setTextColor(0, 0, 0);

        for (const label of def.labels) {
            const x = imageLeft + (label.x * imageWidth);
            const y = imageTop + (label.y * imageHeight);

            // Calculate pointer position (towards center)
            // Extended from 0.2 to 0.5 so leader lines reach closer to the figure
            const centerX = imageLeft + imageWidth / 2;
            const centerY = imageTop + imageHeight / 2;
            const pointerX = x + (centerX - x) * 0.5;
            const pointerY = y + (centerY - y) * 0.1;

            // Draw leader line
            this.doc.setDrawColor(0, 0, 0);
            this.doc.setLineWidth(0.3);
            this.doc.line(x, y, pointerX, pointerY);

            // Draw pointer dot
            this.doc.setFillColor(0, 0, 0);
            this.doc.circle(pointerX, pointerY, 1, 'F');

            // Draw text with white background for readability
            const textAlign = label.x < 0.5 ? 'right' : 'left';
            const textX = label.x < 0.5 ? x - 2 : x + 2;

            // White background
            this.doc.setFont('helvetica', 'normal');
            const textWidth = this.doc.getTextWidth(label.text);
            this.doc.setFillColor(255, 255, 255);
            this.doc.rect(
                textAlign === 'right' ? textX - textWidth - 1 : textX - 1,
                y - fontSize + 1,
                textWidth + 2,
                fontSize + 1,
                'F'
            );

            // Draw text
            this.doc.text(label.text, textX, y, { align: textAlign });
        }

        this.doc.setFont('helvetica', 'normal');
    }

    /**
     * Extract and generate PDF from the HTML content
     * @param {Function} onProgress - Optional callback for progress updates
     */
    async generateFromDOM(onProgress) {
        // Pre-load all images before starting (40% of progress)
        await this.preloadImages(onProgress ? (p) => onProgress(p * 0.4, 'Loading images...') : null);

        // Fetch Partner Guide content and last revised date (10% of progress)
        if (onProgress) onProgress(0.4, 'Loading metadata...');
        await this.fetchLastRevisedDate();
        if (this.source) await this.fetchPartnerGuide();

        if (onProgress) onProgress(0.5, 'Generating PDF...');

        this.initDocument();

        // Get user name if logged in
        let userName = null;
        if (!this.source?.noNetwork && window.AuthState) {
            try {
                const user = await window.AuthState.getUser();
                if (user && user.displayName) {
                    userName = user.displayName;
                }
            } catch (e) {
                // Ignore auth errors, just don't show name
            }
        }

        // Reset group tracking for new render
        this.currentGroup = null;

        this.addTitlePage(userName);

        // Get all sections in PDF order (shopping-list at end for printed booklet)
        const sections = this.getSectionsInPdfOrder();

        for (const section of sections) {
            // Skip static TOC - it doesn't match dynamically rendered sections
            if (section.id === 'toc') {
                continue;
            }

            // Handle Alphabetical Index section specially - use 3-column layout
            if (section.id === 'index') {
                const header = section.querySelector('.section-header');
                if (header) {
                    this.addSectionHeader(header.textContent.trim(), this.source ? this.sourceFirstRowHeight(section, true) : 38);
                }

                // Process each letter subsection
                const subsections = section.querySelectorAll('.subsection');
                for (const subsection of subsections) {
                    const subHeader = subsection.querySelector('h3');
                    if (subHeader) {
                        this.addSubsectionHeader(subHeader.textContent.trim());
                    }

                    // Get phrase list entries and use 3-column index layout
                    const phraseList = subsection.querySelector('.phrase-list');
                    if (phraseList) {
                        const entries = [];
                        phraseList.querySelectorAll('li').forEach(li => {
                            entries.push(li.textContent.trim());
                        });
                        if (entries.length > 0) {
                            this.addIndexList(entries);
                        }
                    }
                }
                continue;
            }

            // Check if we're entering a new group and add group header
            this.checkAndAddGroupHeader(section.id);

            const header = section.querySelector('.section-header');
            if (header) {
                this.addSectionHeader(header.textContent.trim(), this.source ? this.sourceFirstRowHeight(section, true) : 38);
                if (this.source?.tableOfContents) { this.sectionPageNumbers ||= {}; this.sectionPageNumbers[section.id] = this.currentPage; }
            }

            // Process subsections
            const subsections = section.querySelectorAll('.subsection');
            for (const subsection of subsections) {
                const subHeader = subsection.querySelector('h3');
                if (subHeader) {
                    const headerText = subHeader.textContent.trim();

                    // Check if it's a labelled diagram subsection
                    if (subsection.classList.contains('labelled-diagram')) {
                        const labelledContainer = subsection.querySelector('.labelled-image-container');
                        const imageElement = labelledContainer?.querySelector('img');
                        const imageId = subsection.querySelector('[data-image-id]')?.dataset?.imageId;

                        if (imageId) {
                            this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                            await this.addLabelledImage(imageId, imageElement);
                            continue;
                        }
                    }

                    // Check if it's a diagram placeholder (old style)
                    if (headerText.includes('Diagram') || headerText.includes('Layout') || headerText.includes('Map')) {
                        // Check for new-style labelled image inside emergency-box
                        const labelledDiv = subsection.querySelector('[data-image-id]');
                        if (labelledDiv) {
                            const imageId = labelledDiv.dataset.imageId;
                            const labelledContainer = subsection.querySelector('.labelled-image-container');
                            const imageElement = labelledContainer?.querySelector('img');
                            this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                            await this.addLabelledImage(imageId, imageElement);
                            continue;
                        }
                        this.addDiagramPlaceholder(headerText);
                        continue;
                    }

                    this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                }

                // Check for labelled image in this subsection (without labelled-diagram class)
                const labelledDiv = subsection.querySelector('[data-image-id]');
                if (labelledDiv) {
                    const imageId = labelledDiv.dataset.imageId;
                    const labelledContainer = subsection.querySelector('.labelled-image-container');
                    const imageElement = labelledContainer?.querySelector('img');
                    await this.addLabelledImage(imageId, imageElement);
                    continue;
                }

                // Check for emergency box
                const emergencyBox = subsection.querySelector('.emergency-box');
                if (emergencyBox) {
                    // Skip partner-notice-box - it only appears on PDF back cover
                    if (emergencyBox.id === 'partner-notice-box') {
                        continue;
                    }
                    // Skip if it contains a labelled image (already handled above)
                    if (emergencyBox.querySelector('[data-image-id]') || emergencyBox.querySelector('.labelled-image-container')) {
                        continue;
                    }
                    const boxLines = [];
                    emergencyBox.querySelectorAll('p, h3').forEach(el => {
                        boxLines.push(el.textContent.trim());
                    });
                    if (boxLines.length > 0) {
                        const isEmergency = emergencyBox.querySelector('h3')?.textContent.includes('ALERT') ||
                                           emergencyBox.querySelector('h3')?.textContent.includes('EMERGENCY');
                        this.addInfoBox(boxLines, isEmergency);
                    }
                    continue;
                }

                // Get word list
                const wordList = subsection.querySelector('.word-list');
                if (wordList) {
                    const words = [];
                    wordList.querySelectorAll('.word').forEach(word => {
                        words.push(word.textContent.trim());
                    });
                    if (words.length > 0) {
                        this.addWordList(words);
                    }
                }

                // Get phrase list
                const phraseList = subsection.querySelector('.phrase-list');
                if (phraseList) {
                    const phrases = [];
                    phraseList.querySelectorAll('li').forEach(li => {
                        phrases.push(this.source ? { text: li.textContent, highlight: li.dataset.highlight === 'true', passage: li.dataset.passage === 'true' } : li.textContent.trim());
                    });
                    if (phrases.length > 0) {
                        if (this.source) this.addSourcePhraseItems(phrases); else this.addPhraseList(phrases);
                    }
                }

                // Get contacts list (My People section - dynamically rendered)
                const contactsList = subsection.querySelector('.contacts-list');
                if (contactsList) {
                    const contactCards = contactsList.querySelectorAll('.contact-card');
                    if (contactCards.length > 0) {
                        this.addContactsList(contactCards);
                    }
                }
            }

            // Also check for flat-words content (categories without subsections)
            const flatWords = section.querySelector('.section-content > .flat-words');
            if (flatWords) {
                const wordList = flatWords.querySelector('.word-list');
                if (wordList) {
                    const words = [];
                    wordList.querySelectorAll('.word').forEach(word => {
                        words.push(word.textContent.trim());
                    });
                    if (words.length > 0) {
                        this.addWordList(words);
                    }
                }
            }

            // Also check for emergency boxes directly in section (not in subsection)
            const directEmergencyBox = section.querySelector('.section-content > .emergency-box');
            if (directEmergencyBox && directEmergencyBox.id !== 'partner-notice-box') {
                const boxLines = [];
                directEmergencyBox.querySelectorAll('p, h3').forEach(el => {
                    boxLines.push(el.textContent.trim());
                });
                if (boxLines.length > 0) {
                    this.addInfoBox(boxLines, true);
                }
            }
        }

        if (this.source) this.addSourceGuide();
        // Shopping sections are now the back cover for legacy callers.
        // Add final page number
        this.addPageNumber();

        return this.doc;
    }

    /**
     * Add Communication Partner Guide (back cover)
     * Renders content from Partner Guide Settings (user-customizable)
     */
    addPartnerGuide(userName) {
        // Clear running header for this page
        this.currentSectionName = '';

        if (!this.renderingEnabled) {
            this.currentY = this.margins.top;
            return;
        }

        const centerX = this.xOffset + this.pageWidth / 2;
        this.currentY = this.margins.top + 10;

        // Use fetched content or fallback
        const guide = this.partnerGuideContent || this.getDefaultPartnerGuide();

        // Title
        this.doc.setFontSize(this.fontSize.title);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(guide.name || 'For Communication Partners', centerX, this.currentY, { align: 'center' });
        this.currentY += 20;

        // Divider
        this.doc.setDrawColor(150, 150, 150);
        this.doc.line(this.xOffset + this.margins.left + 50, this.currentY,
                     this.xOffset + this.pageWidth - this.margins.right - 50, this.currentY);
        this.currentY += 15;

        // Render each content block
        if (guide.content && Array.isArray(guide.content)) {
            for (const block of guide.content) {
                this.renderPartnerGuideBlock(block);
            }
        }

        // Add date last revised at bottom of back cover
        this.addDateLastRevised();
    }

    /**
     * Render a single Partner Guide content block to PDF
     * @param {Object} block - Content block from Partner Guide Settings
     */
    renderPartnerGuideBlock(block) {
        if (!this.renderingEnabled) return;

        const lineHeight = this.fontSize.body * 1.1;

        switch (block.type) {
            case 'intro-paragraph':
                this.doc.setFontSize(this.fontSize.body);
                this.doc.setFont('helvetica', 'italic');
                this.doc.setTextColor(60, 60, 60);
                const introLines = this.doc.splitTextToSize(block.text || '', this.contentWidth - 10);
                for (const line of introLines) {
                    this.doc.text(line, this.xOffset + this.margins.left + 5, this.currentY);
                    this.currentY += lineHeight;
                }
                this.currentY += 8;
                this.doc.setTextColor(0, 0, 0);
                break;

            case 'guide-section':
                // Section subtitle
                this.doc.setFontSize(this.fontSize.subsectionHeader);
                this.doc.setFont('helvetica', 'bold');
                this.doc.text(block.subtitle || '', this.xOffset + this.margins.left, this.currentY);
                this.currentY += 12;

                // Section items
                this.doc.setFontSize(this.fontSize.body);
                this.doc.setFont('helvetica', 'normal');
                if (block.items && Array.isArray(block.items)) {
                    for (const item of block.items) {
                        const lines = this.doc.splitTextToSize('• ' + item, this.contentWidth - 15);
                        for (let i = 0; i < lines.length; i++) {
                            this.doc.text(lines[i], this.xOffset + this.margins.left + 5 + (i > 0 ? 8 : 0), this.currentY);
                            this.currentY += lineHeight;
                        }
                    }
                }
                this.currentY += 6;
                break;

            case 'guide-section-nested':
                // Section subtitle
                this.doc.setFontSize(this.fontSize.subsectionHeader);
                this.doc.setFont('helvetica', 'bold');
                this.doc.text(block.subtitle || '', this.xOffset + this.margins.left, this.currentY);
                this.currentY += 12;

                // Intro text if present
                if (block.intro) {
                    this.doc.setFontSize(this.fontSize.body);
                    this.doc.setFont('helvetica', 'normal');
                    this.doc.text(block.intro, this.xOffset + this.margins.left + 5, this.currentY);
                    this.currentY += lineHeight + 4;
                }

                // Nested subsections
                if (block.subsections && Array.isArray(block.subsections)) {
                    for (const sub of block.subsections) {
                        if (sub.label) {
                            this.doc.setFontSize(this.fontSize.body);
                            this.doc.setFont('helvetica', 'bold');
                            this.doc.text(sub.label, this.xOffset + this.margins.left + 5, this.currentY);
                            this.currentY += lineHeight;
                        }
                        this.doc.setFont('helvetica', 'normal');
                        if (sub.items && Array.isArray(sub.items)) {
                            for (const item of sub.items) {
                                const lines = this.doc.splitTextToSize('• ' + item, this.contentWidth - 20);
                                for (let i = 0; i < lines.length; i++) {
                                    this.doc.text(lines[i], this.xOffset + this.margins.left + 10 + (i > 0 ? 8 : 0), this.currentY);
                                    this.currentY += lineHeight;
                                }
                            }
                        }
                    }
                }
                this.currentY += 6;
                break;

            case 'quote-block':
                // Section subtitle
                this.doc.setFontSize(this.fontSize.subsectionHeader);
                this.doc.setFont('helvetica', 'bold');
                this.doc.text(block.subtitle || '', this.xOffset + this.margins.left, this.currentY);
                this.currentY += 12;

                // Quotes
                this.doc.setFontSize(this.fontSize.body);
                this.doc.setFont('helvetica', 'italic');
                if (block.quotes && Array.isArray(block.quotes)) {
                    for (const quote of block.quotes) {
                        const lines = this.doc.splitTextToSize('"' + quote + '"', this.contentWidth - 15);
                        for (let i = 0; i < lines.length; i++) {
                            this.doc.text(lines[i], this.xOffset + this.margins.left + 5 + (i > 0 ? 8 : 0), this.currentY);
                            this.currentY += lineHeight;
                        }
                    }
                }
                this.doc.setFont('helvetica', 'normal');
                this.currentY += 6;
                break;

            case 'closing-text':
                this.currentY += 5;
                this.doc.setFontSize(this.fontSize.body);
                this.doc.setFont('helvetica', 'bold');
                this.doc.setTextColor(60, 60, 60);
                const closingLines = this.doc.splitTextToSize(block.text || '', this.contentWidth - 10);
                for (const line of closingLines) {
                    this.doc.text(line, this.xOffset + this.margins.left + 5, this.currentY);
                    this.currentY += lineHeight;
                }
                this.doc.setTextColor(0, 0, 0);
                this.doc.setFont('helvetica', 'normal');
                break;
        }
    }

    /**
     * Format date for display (e.g., "January 15, 2026")
     * @param {string} isoDate - ISO date string
     * @returns {string} Formatted date
     */
    formatDate(isoDate) {
        try {
            const date = new Date(isoDate);
            return date.toLocaleDateString('en-CA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch {
            return new Date().toLocaleDateString('en-CA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    /**
     * Add "Date last revised" footer to back cover
     * Only shows if user has customized their Reference Library
     */
    addDateLastRevised() {
        if (!this.renderingEnabled) return;

        // Only show date if user has made customizations
        if (!this.lastRevisedDate) return;

        const dateStr = this.formatDate(this.lastRevisedDate);
        const footerY = this.source ? this.pageHeight - 45 : this.pageHeight - this.margins.bottom + 10;
        const centerX = this.xOffset + this.pageWidth / 2;

        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(8);
        this.doc.setTextColor(128); // Grey
        this.doc.text(`Last revised: ${dateStr}`, centerX, footerY, { align: 'center' });
        this.doc.setTextColor(0);
    }

    /**
     * Generate and download the PDF
     */
    async download(filename) {
        const doc = await this.generateFromDOM();
        const finalFilename = filename || `communication-book-${this.format}.pdf`;
        doc.save(finalFilename);
    }

    /**
     * Get total page count
     */
    getPageCount() {
        return this.currentPage;
    }

    /**
     * Generate a booklet-format PDF for double-sided printing
     * Uses half-letter size (5.5" x 8.5") content on landscape letter paper
     * When printed double-sided and folded, creates a readable booklet
     */
    async generateBookletFromDOM(onProgress) {
        console.log('Starting booklet generation...');

        // Pre-load images first (40% of progress)
        await this.preloadImages(onProgress ? (p) => onProgress(p * 0.4, 'Loading images...') : null);
        console.log('Images preloaded:', this.preloadedImages.size);

        // Fetch Partner Guide content and last revised date (10% of progress)
        if (onProgress) onProgress(0.4, 'Loading metadata...');
        await this.fetchLastRevisedDate();
        if (this.source) await this.fetchPartnerGuide();

        if (onProgress) onProgress(0.5, 'Generating booklet...');

        // Use half-letter dimensions (same as Communication Notebook booklet)
        // This fits 2 pages side-by-side on landscape letter paper
        const contentPageWidth = 396;   // 5.5 inches in points
        const contentPageHeight = 612;  // 8.5 inches in points

        // Set up for half-letter content pages
        this.format = 'booklet';
        this.pageWidth = contentPageWidth;
        this.pageHeight = contentPageHeight;
        this.fontSize = {
            title: 14,
            sectionHeader: 11,
            subsectionHeader: 10,
            body: 9,
            pageNumber: 7
        };
        if (this.source && !this.source.compact) this.fontSize = { title: 20, sectionHeader: 18, subsectionHeader: 16, body: 16, pageNumber: 9 };
        this.margins = { top: 32, bottom: 40, left: 32, right: 32 };
        // The source edition uses 16 pt body text; keep its ascenders below the running header.
        if (this.source && !this.source.compact) this.margins.top = 48;
        this.contentWidth = this.pageWidth - this.margins.left - this.margins.right;
        this.contentHeight = this.pageHeight - this.margins.top - this.margins.bottom;

        // First pass: generate content to count pages
        this.initDocument();

        // Get user name
        let userName = null;
        if (!this.source?.noNetwork && window.AuthState) {
            try {
                const user = await window.AuthState.getUser();
                if (user && user.displayName) {
                    userName = user.displayName;
                }
            } catch (e) {
                // Ignore
            }
        }

        // Generate all content (this populates this.currentPage)
        await this.renderAllContent(userName);
        this.addPageNumber(); // Final page number

        const totalPages = this.currentPage;
        const paddedPageCount = Math.ceil(totalPages / 4) * 4;
        console.log('First pass complete. Total pages:', totalPages, 'Padded to:', paddedPageCount);

        // Calculate booklet layout (saddle-stitch imposition)
        const sheetCount = paddedPageCount / 4;
        const layout = this.source ? this.source.imposer.calculateA5Layout(paddedPageCount) : [];

        for (let i = 0; !this.source && i < sheetCount; i++) {
            layout.push({
                front: {
                    left: paddedPageCount - (i * 2),
                    right: (i * 2) + 1
                },
                back: {
                    left: (i * 2) + 2,
                    right: paddedPageCount - (i * 2) - 1
                }
            });
        }

        // Create landscape letter document for booklet output
        const bookletDoc = new jspdf.jsPDF({
            orientation: 'landscape',
            unit: 'pt',
            format: 'letter',
            compress: true
        });

        // Set document metadata for accessibility
        bookletDoc.setProperties({
            title: 'Communication Book',
            subject: 'Communication vocabulary reference',
            author: 'Communication Notes App',
            keywords: 'vocabulary, reference, communication, PPA, booklet',
            language: 'en-CA'
        });

        const sheetWidth = 792;
        const sheetHeight = 612;
        const halfWidth = sheetWidth / 2;

        // We need to render each page of content at the correct booklet position
        // Since jsPDF can't copy pages, we'll render each page's content at offset positions

        // Create an array to store page rendering functions
        // We'll re-render content for each logical page at its booklet position

        let isFirstPage = true;

        for (let sheetIdx = 0; sheetIdx < sheetCount; sheetIdx++) {
            const sheet = layout[sheetIdx];

            // Front side of sheet
            if (!isFirstPage) {
                bookletDoc.addPage();
            }
            isFirstPage = false;

            // Render left page (sheet.front.left)
            if (sheet.front.left <= totalPages) {
                await this.renderPageAtPosition(bookletDoc, sheet.front.left, 0, totalPages, userName);
            }

            // Render right page (sheet.front.right)
            if (sheet.front.right <= totalPages) {
                await this.renderPageAtPosition(bookletDoc, sheet.front.right, halfWidth, totalPages, userName);
            }

            // Back side of sheet
            bookletDoc.addPage();

            // Render left page (sheet.back.left)
            if (sheet.back.left <= totalPages) {
                await this.renderPageAtPosition(bookletDoc, sheet.back.left, 0, totalPages, userName);
            }

            // Render right page (sheet.back.right)
            if (sheet.back.right <= totalPages) {
                await this.renderPageAtPosition(bookletDoc, sheet.back.right, halfWidth, totalPages, userName);
            }
        }

        console.log('Booklet generation complete. Sheets:', layout.length);
        return bookletDoc;
    }

    /**
     * Render a specific logical page at a given x offset on the booklet sheet
     * Re-renders all content but only draws when on the target page
     */
    async renderPageAtPosition(doc, targetPageNum, xOffset, totalPages, userName) {
        // Set up for booklet rendering
        this.doc = doc;
        this.xOffset = xOffset;
        this.bookletMode = true;
        this.targetPage = targetPageNum;
        this.currentPage = 1;
        this.currentY = this.margins.top;
        this.renderingEnabled = (this.currentPage === this.targetPage);

        // Ensure font is set (needed when switching to booklet doc)
        this.doc.setFont('helvetica', 'normal');

        // Check if this is a blank padding page
        if (targetPageNum > totalPages) {
            // Just add page number for blank pages
            doc.setFontSize(7);
            doc.setTextColor(150, 150, 150);
            doc.text(targetPageNum.toString(), xOffset + this.pageWidth / 2, this.pageHeight - 25, { align: 'center' });
            doc.setFontSize(6);
            doc.text('Communication Book', xOffset + this.pageWidth / 2, this.pageHeight - 15, { align: 'center' });
            doc.setTextColor(0, 0, 0);
            return;
        }

        // Re-render all content - only the target page will actually draw
        await this.renderAllContent(userName);

        // Add page number for this page (if it's the target)
        if (this.renderingEnabled) {
            this.addPageNumber();
        }

        // Reset booklet mode
        this.bookletMode = false;
        this.renderingEnabled = true;
    }

    /**
     * Render all content from the DOM (extracted from generateFromDOM for reuse)
     */
    async renderAllContent(userName) {
        // Reset group tracking for new render
        this.currentGroup = null;

        this.addTitlePage(userName);

        // Get all sections in PDF order (shopping-list at end for printed booklet)
        const sections = this.getSectionsInPdfOrder();

        for (const section of sections) {
            // Skip static TOC - it doesn't match dynamically rendered sections
            if (section.id === 'toc') {
                continue;
            }

            // Handle Alphabetical Index section specially - use 3-column layout
            if (section.id === 'index') {
                const header = section.querySelector('.section-header');
                if (header) {
                    this.addSectionHeader(header.textContent.trim(), this.source ? this.sourceFirstRowHeight(section, true) : 38);
                if (this.source?.tableOfContents) { this.sectionPageNumbers ||= {}; this.sectionPageNumbers[section.id] = this.currentPage; }
                }

                // Process each letter subsection
                const subsections = section.querySelectorAll('.subsection');
                for (const subsection of subsections) {
                    const subHeader = subsection.querySelector('h3');
                    if (subHeader) {
                        this.addSubsectionHeader(subHeader.textContent.trim());
                    }

                    // Get phrase list entries and use 3-column index layout
                    const phraseList = subsection.querySelector('.phrase-list');
                    if (phraseList) {
                        const entries = [];
                        phraseList.querySelectorAll('li').forEach(li => {
                            entries.push(li.textContent.trim());
                        });
                        if (entries.length > 0) {
                            this.addIndexList(entries);
                        }
                    }
                }
                continue;
            }

            // Check if we're entering a new group and add group header
            this.checkAndAddGroupHeader(section.id);

            const header = section.querySelector('.section-header');
            if (header) {
                this.addSectionHeader(header.textContent.trim(), this.source ? this.sourceFirstRowHeight(section, true) : 38);
                if (this.source?.tableOfContents) { this.sectionPageNumbers ||= {}; this.sectionPageNumbers[section.id] = this.currentPage; }
            }

            const subsections = section.querySelectorAll('.subsection');
            for (const subsection of subsections) {
                const subHeader = subsection.querySelector('h3');
                if (subHeader) {
                    const headerText = subHeader.textContent.trim();

                    if (subsection.classList.contains('labelled-diagram')) {
                        const imageId = subsection.querySelector('[data-image-id]')?.dataset?.imageId;
                        console.log(`Found labelled-diagram: ${headerText}, imageId: ${imageId}, currentPage: ${this.currentPage}, targetPage: ${this.targetPage}`);
                        if (imageId) {
                            this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                            await this.addLabelledImage(imageId, null);
                            continue;
                        }
                    }

                    if (headerText.includes('Diagram') || headerText.includes('Layout') || headerText.includes('Map')) {
                        const labelledDiv = subsection.querySelector('[data-image-id]');
                        console.log(`Found diagram/layout/map: ${headerText}, labelledDiv: ${!!labelledDiv}`);
                        if (labelledDiv) {
                            const imageId = labelledDiv.dataset.imageId;
                            this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                            await this.addLabelledImage(imageId, null);
                            continue;
                        }
                        console.log(`Calling addDiagramPlaceholder for: ${headerText}`);
                        this.addDiagramPlaceholder(headerText);
                        continue;
                    }

                    this.addSubsectionHeader(headerText, this.source ? this.sourceFirstRowHeight(subsection) : 38);
                }

                const labelledDiv = subsection.querySelector('[data-image-id]');
                if (labelledDiv) {
                    const imageId = labelledDiv.dataset.imageId;
                    await this.addLabelledImage(imageId, null);
                    continue;
                }

                const emergencyBox = subsection.querySelector('.emergency-box');
                if (emergencyBox) {
                    // Skip partner-notice-box - it only appears on PDF back cover
                    if (emergencyBox.id === 'partner-notice-box') {
                        continue;
                    }
                    if (emergencyBox.querySelector('[data-image-id]') || emergencyBox.querySelector('.labelled-image-container')) {
                        continue;
                    }
                    const boxLines = [];
                    emergencyBox.querySelectorAll('p, h3').forEach(el => {
                        boxLines.push(el.textContent.trim());
                    });
                    if (boxLines.length > 0) {
                        const isEmergency = emergencyBox.querySelector('h3')?.textContent.includes('ALERT') ||
                                           emergencyBox.querySelector('h3')?.textContent.includes('EMERGENCY');
                        this.addInfoBox(boxLines, isEmergency);
                    }
                    continue;
                }

                const wordList = subsection.querySelector('.word-list');
                if (wordList) {
                    const words = [];
                    wordList.querySelectorAll('.word').forEach(word => {
                        words.push(word.textContent.trim());
                    });
                    if (words.length > 0) {
                        this.addWordList(words);
                    }
                }

                const phraseList = subsection.querySelector('.phrase-list');
                if (phraseList) {
                    const phrases = [];
                    phraseList.querySelectorAll('li').forEach(li => {
                        phrases.push(this.source ? { text: li.textContent, highlight: li.dataset.highlight === 'true', passage: li.dataset.passage === 'true' } : li.textContent.trim());
                    });
                    if (phrases.length > 0) {
                        if (this.source) this.addSourcePhraseItems(phrases); else this.addPhraseList(phrases);
                    }
                }

                // Get contacts list (My People section - dynamically rendered)
                const contactsList = subsection.querySelector('.contacts-list');
                if (contactsList) {
                    const contactCards = contactsList.querySelectorAll('.contact-card');
                    if (contactCards.length > 0) {
                        this.addContactsList(contactCards);
                    }
                }
            }

            // Also check for flat-words content (categories without subsections)
            const flatWords = section.querySelector('.section-content > .flat-words');
            if (flatWords) {
                const wordList = flatWords.querySelector('.word-list');
                if (wordList) {
                    const words = [];
                    wordList.querySelectorAll('.word').forEach(word => {
                        words.push(word.textContent.trim());
                    });
                    if (words.length > 0) {
                        this.addWordList(words);
                    }
                }
            }

            const directEmergencyBox = section.querySelector('.section-content > .emergency-box');
            if (directEmergencyBox && directEmergencyBox.id !== 'partner-notice-box') {
                const boxLines = [];
                directEmergencyBox.querySelectorAll('p, h3').forEach(el => {
                    boxLines.push(el.textContent.trim());
                });
                if (boxLines.length > 0) {
                    this.addInfoBox(boxLines, true);
                }
            }
        }

        if (this.source) this.addSourceGuide();
        // Shopping sections are now the back cover for legacy callers.
    }

    // Source-only readable layout. A wrapped line is checked individually so an arbitrary
    // passage can span pages without changing legacy grid density or truncating its tail.
    sourceFirstRowHeight(container, includeHeading = false) {
        const size = this.source.compact ? this.fontSize.body : 16, leading = this.source.compact ? 12 : 24, padding = this.source.compact ? 2 : 14;
        const item = container.querySelector('.phrase-list li');
        if (!item) return 38;
        this.doc.setFontSize(size);
        this.doc.setFont('helvetica', item.dataset.highlight === 'true' ? 'bold' : 'normal');
        const text = item.textContent.replace(/\u2605/g, '*');
        const columns = this.source.compact || this.contentWidth >= 450 ? 3 : 2, width = (this.contentWidth - 12 * (columns - 1)) / columns;
        const short = item.dataset.passage !== 'true' && !text.includes('\n') && this.doc.getTextWidth(text) <= width - padding;
        let height = short ? leading + padding : Math.min(5, this.doc.splitTextToSize(text, this.contentWidth - padding).length) * leading + padding;
        const heading = includeHeading && container.querySelector('.subsection h3');
        if (heading) {
            this.doc.setFont('helvetica', 'bold');
            height += this.doc.splitTextToSize(heading.textContent, this.contentWidth - 10).length * this.fontSize.subsectionHeader * 1.5 + (this.source.compact ? 10 : 18);
        }
        return height;
    }

    addSourcePhraseItems(items) {
        // Helvetica cannot encode the decorative black-star glyph. Keep a visible
        // monochrome marker without forcing the whole word into unsupported glyphs.
        items = items.map(item => ({ ...item, text: item.text.replace(/\u2605/g, '*') }));
        const compact = this.source.compact, size = compact ? this.fontSize.body : 16, leading = compact ? 12 : 24, padding = compact ? 2 : 14, columns = compact || this.contentWidth >= 450 ? 3 : 2, gap = 12;
        const width = (this.contentWidth - gap * (columns - 1)) / columns;
        let row = [];
        const draw = (cells, cellWidth) => {
            const height = Math.max(...cells.map(c => c.lines.length)) * leading + padding;
            this.checkPageBreak(height);
            for (const [index, cell] of cells.entries()) {
                const x = this.xOffset + this.margins.left + index * (cellWidth + gap);
                this.doc.setFontSize(size); this.doc.setFont('helvetica', cell.highlight ? 'bold' : 'normal');
                if (this.renderingEnabled) {
                    if (cell.highlight) { this.doc.setDrawColor(0); this.doc.setLineWidth(1.2); this.doc.rect(x, this.currentY - (compact ? size : 18), cellWidth, height - (compact ? 0 : 6)); }
                    cell.lines.forEach((line, i) => this.doc.text(line, x + (compact ? 1 : 7), this.currentY + i * leading));
                }
            }
            this.currentY += height;
        };
        const flush = () => { if (row.length) { draw(row, width); row = []; } };
        for (const item of items) {
            this.doc.setFontSize(size); this.doc.setFont('helvetica', item.highlight ? 'bold' : 'normal');
            const short = !item.passage && !item.text.includes('\n') && this.doc.getTextWidth(item.text) <= width - padding;
            if (short) { row.push({ ...item, lines: [item.text] }); if (row.length === columns) flush(); }
            else {
                flush();
                this.doc.setFontSize(size); this.doc.setFont('helvetica', item.highlight ? 'bold' : 'normal');
                const lines = this.doc.splitTextToSize(item.text || ' ', this.contentWidth - padding);
                const capacity = Math.max(1, Math.floor((this.pageHeight - this.margins.top - this.margins.bottom - 65) / leading));
                for (let i = 0; i < lines.length;) {
                    let available = Math.floor((this.pageHeight - this.margins.bottom - this.currentY - padding) / leading);
                    if (available < 1) { this.addPage(); available = Math.floor((this.pageHeight - this.margins.bottom - this.currentY - padding) / leading); }
                    const count = Math.max(1, Math.min(capacity, available));
                    draw([{ ...item, lines: lines.slice(i, i + count) }], this.contentWidth);
                    i += count;
                }
            }
        }
        flush(); this.currentY += 3;
    }

    addSourceText(text, size = 16, bold = false) {
        text = text.replace(/\u2605/g, '*');
        this.doc.setFontSize(size);
        this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
        const lines = this.doc.splitTextToSize(text || ' ', this.contentWidth - 10);
        for (const line of lines) {
            this.checkPageBreak(size * 1.5);
            // Page-break headers change font, so restore before drawing.
            this.doc.setFontSize(size);
            this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
            if (this.renderingEnabled) this.doc.text(line, this.xOffset + this.margins.left, this.currentY);
            this.currentY += size * 1.5;
        }
    }

    addSourceGuide() {
        if (this.source?.excludeGuide === true) return;
        this.currentSectionName = '';
        this.addPage();
        // Guide occupies the final logical back cover, with padding before it.
        if (this.format === 'booklet') while (this.currentPage % 4) this.addPage();
        const guide = this.partnerGuideContent;
        if (!guide) throw new Error('Owned Guide unavailable.');
        const startPage = this.currentPage;
        const startY = this.currentY, emphasis = !!this.source.guideHighlight;
        this.addSourceText(guide.name, 17, true);
        this.currentY += 10;
        for (const block of guide.content) {
            if (block.type === 'intro-paragraph' || block.type === 'closing-text') this.addSourceText(block.text, 13, emphasis);
            else if (block.type === 'guide-section') {
                this.currentY += 8;
                this.addSourceText(block.subtitle, 15, true);
                for (const item of block.items || []) this.addSourceText('• ' + item, 13, emphasis);
            } else throw new Error('This Guide block requires a print adapter before output.');
        }
        if (this.currentPage !== startPage) throw new Error('Owned Guide exceeds its safe back-cover layout. Retain content and revise layout before printing.');
        if (emphasis && this.renderingEnabled) { this.doc.setDrawColor(0); this.doc.setLineWidth(1.2); this.doc.rect(this.xOffset + this.margins.left - 5, startY - 19, this.contentWidth + 10, this.currentY - startY + 24); }
        if (this.renderingEnabled) this.addDateLastRevised();
    }

    /**
     * Download as booklet format
     * Creates landscape letter PDF ready for double-sided printing
     */
    async downloadBooklet(filename) {
        try {
            console.log('downloadBooklet called');
            const doc = await this.generateBookletFromDOM();
            const finalFilename = filename || 'communication-book-booklet.pdf';
            console.log('Saving PDF as:', finalFilename);
            doc.save(finalFilename);
            console.log('PDF save complete');
        } catch (error) {
            console.error('Booklet generation error:', error);
            throw error; // Re-throw so the button handler can show the error
        }
    }
}

// Make available globally
window.ReferenceLibraryPDF = ReferenceLibraryPDF;
