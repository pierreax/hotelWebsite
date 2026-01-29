$(document).ready(function () {
    console.log("[Init] Hotel Site Loaded");

    // Constants and Selectors
    const SELECTORS = {
        resultsContainer: $('#resultsBox'),
        flightTrackingModal: $('#flightTrackingModal'),
        currencyInput: $('#currency'),
        emailInput: $('#email'),
        locationInput: $('#location'),
        searchBtn: $('#searchButton'),
        searchForm: $('#searchForm'),
        loader: $('.loader'),
        noResultsMessage: $('#noResultsMessage'),
        submitText: $('#submitText'),
        submitToSheetBtn: $('#submitToSheet'),
        datePickerInput: $('.datepicker'),
        confirmFlightTrackerBtn: $('#confirmFlightTracker'),
        btnSecondary: $('.btn-secondary'),
        thankYouOkBtn: $('#closeThankYouModal'),
    };

    // API Endpoints
    const API_ENDPOINTS = {
        geolocation: '/api/geolocation',
        getAccessToken: '/api/getAccessToken',
        getHotelOffersByCoordinates: '/api/getHotelOffersByCoordinates',
        sheety: '/api/sendDataToSheety',
        sendEmail: '/api/sendEmail',
        getCoordinatesByLocation: '/api/getCoordinatesByLocation',
    };

    // State Management
    const state = {
        accessToken: '',
        internalHotelIds: [],
        selectedHotels: [],
        locationCoordinates: {},
        datePicker: null,
        redirectUrl: '',
        redirectEmail: '',
        redirectCity: '',
        redirectCurrency: '',
        redirectDateFrom: '',
        redirectDateTo: '',
        redirected: false,
        initialCurrency: '',
        hotelsData: [],
    };


    /**
     * Capture redirect parameters after form submission.
     */
    const captureRedirectParameters = () => {
        state.redirectEmail = encodeURIComponent(SELECTORS.emailInput.val());
        state.redirectCurrency = encodeURIComponent(SELECTORS.currencyInput.val());
        state.redirectDateFrom = formatDateToLocalISOString(state.datePicker.selectedDates[0]);
        state.redirectDateTo = formatDateToLocalISOString(state.datePicker.selectedDates[1]);
        state.redirectUrl = `https://flights.robotize.no/?email=${state.redirectEmail}&currency=${state.redirectCurrency}&city=${state.redirectCity}&dateFrom=${state.redirectDateFrom}&dateTo=${state.redirectDateTo}`;
        console.log('[Submit] Redirect URL:', state.redirectUrl);
    };

    /**
     * Initialize the Flatpickr date range picker.
     */
    const initializeDatePicker = () => {
        return flatpickr(SELECTORS.datePickerInput, {
            mode: "range",
            dateFormat: "j M Y",
            altInput: true,
            altFormat: "j M Y",
            minDate: 'today',
            locale: {
                firstDayOfWeek: 1
            },
            onChange: function (selectedDates, dateStr, instance) {
                console.log('[UI] Date changed:', dateStr);
                instance.element.dispatchEvent(new Event('input'));
            }
        });
    };

    /**
     * Display the flight tracking modal.
     */
    const showFlightTrackingModal = () => {
        console.log('[Modal] Displaying flight tracking modal.');
        SELECTORS.flightTrackingModal.modal('show');
        $('body').addClass('modal-open');
    };

    /**
     * Show the thank you modal.
     */
    const showThankYouModal = () => {
        console.log('[Modal] Displaying thank you modal.');
        $('#thankYouModal').modal('show');
    };

    /**
     * Parse query parameters from the URL and set the `redirected` flag if parameters exist.
     * @returns {Object} Query parameters as key-value pairs.
     */
    const getQueryParams = () => {
        const params = new URLSearchParams(window.location.search);
        const queryParams = {};

        for (const [key, value] of params.entries()) {
            queryParams[key] = value;
        }

        if (Object.keys(queryParams).length > 0) {
            if (queryParams.dateFrom || queryParams.dateTo || queryParams.email || queryParams.city) {
                state.redirected = true;
                console.log('[URL] User has been redirected with parameters:', queryParams);
            }
        }

        return queryParams;
    };

    /**
     * Format a Date object to a local ISO string (YYYY-MM-DD).
     * @param {Date} date 
     * @returns {string} Formatted date string.
     */
    const formatDateToLocalISOString = (date) => {
        if (!date) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().split('T')[0];
    };

    /**
     * Fetch JSON data with error handling.
     * @param {string} url 
     * @param {Object} options 
     * @returns {Object} Parsed JSON data.
     */
    const fetchJSON = async (url, options = {}, retries = 2) => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                const response = await fetch(url, options);
                const text = await response.text();
                if (!response.ok) {
                    if (response.status >= 500 && attempt < retries) {
                        console.warn(`[API] Server error ${response.status} on attempt ${attempt + 1}, retrying...`);
                        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                        continue;
                    }
                    throw new Error(`HTTP error ${response.status}: ${text}`);
                }
                return JSON.parse(text);
            } catch (error) {
                if (attempt < retries && error.message?.includes('Failed to fetch')) {
                    console.warn(`[API] Network error on attempt ${attempt + 1}, retrying...`);
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                    continue;
                }
                console.error(`[API] Error fetching JSON from ${url}:`, error);
                throw error;
            }
        }
    };

    /**
     * Fetch coordinates based on a location name.
     * @param {string} location - The name of the location (e.g., "New York").
     * @returns {Promise<Object>} - A promise that resolves to the coordinates object { lat: number, lng: number }.
     */
    const fetchCoordinates = async (location) => {
        try {
            if (!location) {
                throw new Error('Location is required to fetch coordinates.');
            }

            const response = await fetch(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(location)}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch coordinates: ${errorText}`);
            }

            const data = await response.json();

            if (data && data.results && data.results.length > 0) {
                const firstResult = data.results[0];
                const coordinates = firstResult.geometry.location;
                return coordinates; // { lat: number, lng: number }
            } else {
                throw new Error('No coordinates found for the provided location.');
            }
        } catch (error) {
            console.error('[API] Error in fetchCoordinates:', error);
            throw error; // Rethrow to handle it in the calling function
        }
    };

    /**
     * Initialize form fields with query parameters.
     * @param {Object} queryParams 
     */
    const initializeFormFields = (queryParams) => {
        if (queryParams.email) {
            SELECTORS.emailInput.val(queryParams.email);
        }
        if (queryParams.currency) {
            SELECTORS.currencyInput.val(queryParams.currency).trigger('change');
        }
        if (queryParams.city) {
            SELECTORS.locationInput.val(queryParams.city);
        }
        if (queryParams.dateFrom && queryParams.dateTo) {
            state.datePicker.setDate([queryParams.dateFrom, queryParams.dateTo], true, "d/m/Y");
        }

        // If coordinates are already fetched (from redirection), enable the search button
        if (state.locationCoordinates && Object.keys(state.locationCoordinates).length > 0) {
            SELECTORS.searchBtn.prop('disabled', false);
        }
    };

    /**
     * Set currency based on IP geolocation asynchronously without blocking.
     * @returns {Promise<void>} A Promise that resolves when the currency is set or a fallback is applied.
     */
    const setCurrencyFromIP = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

            const response = await fetch(API_ENDPOINTS.geolocation, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.log('[Location] Geolocation service unavailable. Using default currency.');
                const defaultCurrency = 'USD';
                SELECTORS.currencyInput.val(defaultCurrency).trigger('change');
                return;
            }

            const data = await response.json();
            const currency = data.currency?.code;

            if (currency) {
                console.log('[Location] Setting currency to:', currency);
                SELECTORS.currencyInput.val(currency).trigger('change');
            } else {
                const defaultCurrency = 'USD';
                SELECTORS.currencyInput.val(defaultCurrency).trigger('change');
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('[Location] Currency API call timed out. Using default currency.');
            } else {
                console.log('[Location] Geolocation not available:', error.message);
            }
            const defaultCurrency = 'USD';
            SELECTORS.currencyInput.val(defaultCurrency).trigger('change');
        }
    };


    /**
     * Initialize location input listener with debouncing to prevent excessive API calls.
     */
    const initLocationInputListener = () => {
        let debounceTimeout;
        const debounceDelay = 500; // milliseconds

        SELECTORS.locationInput.on('focus', function () {
            this.select();
        });

        SELECTORS.locationInput.on('blur', function (event) {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => handleLocationInput(event), debounceDelay);
        });
    };

    /**
     * Handle location input after debounce.
     */
    const handleLocationInput = async (event) => {
        const location = event.target.value.trim();
        SELECTORS.searchBtn.prop('disabled', true);
        SELECTORS.resultsContainer.empty();
        SELECTORS.noResultsMessage.hide(); // Optionally hide no results message when input changes

        if (!location) {
            console.log('[Location] Location input is empty. Clearing hotels and disabling search button.');
            return;
        }

        try {
            console.log('[Location] Fetching coordinates for location:', location);
            const coordinates = await fetchCoordinates(location);
            state.locationCoordinates = coordinates;
            console.log('[Location] Coordinates:', state.locationCoordinates);

            const locationData = await fetchJSON(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(location)}`);
            const cityComponent = locationData.results[0].address_components.find(component => 
                component.types.includes('locality') || component.types.includes('postal_town')
            );

            state.redirectCity = cityComponent ? cityComponent.long_name : '';
            console.log('[Location] City:', state.redirectCity || 'Not found');

            SELECTORS.searchBtn.prop('disabled', false);
        } catch (error) {
            console.error('[Location] Error handling location input:', error);
            SELECTORS.noResultsMessage.show().text('Failed to fetch location data. Please try again.');
        }
    };

    /**
     * Handle form submission for searching hotels.
     * @param {Event} event 
     */
    const handleSearchFormSubmit = async (event) => {
        event.preventDefault();
        SELECTORS.resultsContainer.empty();
        SELECTORS.noResultsMessage.hide();
        SELECTORS.submitText.hide();
        SELECTORS.loader.show();

        const formData = {
            location: SELECTORS.locationInput.val(),
            dateRange: state.datePicker.selectedDates,
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
            limitResults: parseInt($('#limitResults').val(), 10) || 20,
            formCurrency: SELECTORS.currencyInput.val(),
        };

        const [checkInDate, checkOutDate] = formData.dateRange.map(formatDateToLocalISOString);
        const numberOfNights = formData.dateRange[1] && formData.dateRange[0]
            ? Math.round((formData.dateRange[1] - formData.dateRange[0]) / (1000 * 60 * 60 * 24))
            : 0;

        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            SELECTORS.datePickerInput.focus();
            SELECTORS.loader.hide();
            return;
        }

        if (!state.locationCoordinates || Object.keys(state.locationCoordinates).length === 0) {
            alert('Please enter a valid location to fetch coordinates.');
            SELECTORS.locationInput.focus();
            SELECTORS.loader.hide();
            return;
        }

        console.log('[Search] Form Data:', {
            location: formData.location,
            checkInDate,
            checkOutDate,
            formCurrency: formData.formCurrency,
        });

        try {
            console.log('[Search] Fetching hotel offers for:', formData.location,state.locationCoordinates.lat,state.locationCoordinates.lng, checkInDate, checkOutDate, formData.adults, formData.numberOfRooms, formData.formCurrency);
            const params = new URLSearchParams({
                latitude: state.locationCoordinates.lat,
                longitude: state.locationCoordinates.lng,
                arrival_date: checkInDate,
                departure_date: checkOutDate,
                adults: formData.adults,
                room_qty: formData.numberOfRooms,
                currency_code: formData.formCurrency
            }).toString();
            const url = `${API_ENDPOINTS.getHotelOffersByCoordinates}?${params}`;
            let offersData = await fetchJSON(url);
            offersData = offersData.data.result;
            console.log('[Search] Hotel Offers Data:', offersData);

            if (offersData.length > 0) {
                const offersWithDistance = calculateDistances(offersData, state.locationCoordinates);
                console.log('[Search] Offers with Distance:', offersWithDistance);

                offersWithDistance.sort((a, b) => {
                    const distanceA = convertToMeters(a.distanceDisplay);
                    const distanceB = convertToMeters(b.distanceDisplay);
                    return distanceA - distanceB;
                });
                console.log('[Search] Sorted Offers:', offersWithDistance);

                console.log('[UI] Rendering hotel cards...');
                renderHotelCards(offersWithDistance, formData);
                $('.email-section').show();
            } else {
                SELECTORS.noResultsMessage.show().text('No hotels found for the selected location.');
                $('.email-section').hide();
            }
        } catch (error) {
            console.error('[Search] Error during form submission:', error.message);
            SELECTORS.noResultsMessage.show().text('An error occurred while fetching hotel data. Please try again.');
            $('.email-section').hide();
        } finally {
            SELECTORS.loader.hide();
        }
    };

    /**
     * Convert distance display string to meters.
     * @param {string} distanceDisplay 
     * @returns {number} Distance in meters.
     */
    const convertToMeters = (distanceDisplay) => {
        const [value, unit] = distanceDisplay.split(' ');
        const numericValue = parseFloat(value);
        if (unit === 'km') {
            return numericValue * 1000;
        }
        return numericValue;
    };

    /**
     * Calculate the distance between two geographic coordinates.
     * @param {number} lat1 
     * @param {number} lon1 
     * @param {number} lat2 
     * @param {number} lon2 
     * @returns {Object} Distance in numeric and display formats.
     */
    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Radius of the Earth in km
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceKm = R * c;

        if (distanceKm < 1) {
            return { numeric: distanceKm * 1000, display: `${Math.round(distanceKm * 1000)} m` };
        } else {
            return { numeric: distanceKm, display: `${distanceKm.toFixed(2)} km` };
        }
    };

    /**
     * Calculate distances for all hotel offers relative to the user's location.
     * @param {Array} offers 
     * @param {Object} userCoords 
     * @returns {Array} Offers with distance information.
     */
    const calculateDistances = (offers, userCoords) => {
        return offers.map(offer => {
            const hotelCoords = {
                latitude: offer.latitude,
                longitude: offer.longitude
            };
            const distanceInfo = calculateDistance(
                userCoords.lat,
                userCoords.lng,
                hotelCoords.latitude,
                hotelCoords.longitude
            );
            return {
                ...offer,
                distance: distanceInfo.numeric,
                distanceDisplay: distanceInfo.display
            };
        });
    };

    /**
     * Render hotel offer cards to the results container using Document Fragment for performance.
     * @param {Array} offers 
     * @param {Object} formData
     */
    const renderHotelCards = (offers, formData) => {
        if (offers.length === 0) {
            console.log('[UI] No offers found, showing message to the user.');
            SELECTORS.resultsContainer.html('<div class="no-results-message">No valid hotel offers found. Please try different search criteria.</div>');
            return;
        }

        const fragment = $(document.createDocumentFragment());

        offers.forEach((offer) => {
            const totalPrice = offer.composite_price_breakdown.gross_amount.amount_rounded;
            const pricePerNight = offer.composite_price_breakdown.gross_amount_per_night.amount_rounded;
        
            const card = $('<div>').addClass('card');
            $('<div>').addClass('hiddenHotelId').text(offer.hotel_id).appendTo(card);
            $('<div>').addClass('card-header').text(formatHotelName(offer.hotel_name)).appendTo(card);
            
            const cardContent = $('<div>').addClass('card-content');
            const pricesDiv = $('<div>').addClass('prices');
            $('<div>').addClass('price-per-night')
                .append($('<span>').addClass('amount').text(formatPrice(pricePerNight)))
                .append($('<span>').addClass('label').text('per night'))
                .appendTo(pricesDiv);
            $('<div>').addClass('total-price')
                .append($('<span>').addClass('amount').text(formatPrice(totalPrice)))
                .append($('<span>').addClass('label').text('in total'))
                .appendTo(pricesDiv);
            cardContent.append(pricesDiv);

            const badgesDiv = $('<div>').addClass('badges');
            $('<div>').addClass('badge distance').text(offer.distanceDisplay).appendTo(badgesDiv);

            const score = parseFloat(offer.review_score) || 0;
            let ratingClass = 'rating-low';
            if (score >= 8) ratingClass = 'rating-high';
            else if (score >= 6) ratingClass = 'rating-medium';

            $('<div>').addClass(`badge rating ${ratingClass}`).text(`Rating: ${offer.review_score}`).appendTo(badgesDiv);
            cardContent.append(badgesDiv);
            card.append(cardContent);
        
            const cardFooter = $('<div>').addClass('card-footer');
            const checkboxId = `checkbox-${offer.hotel_id}`;
            const checkboxInput = $('<input>').attr({ type: 'checkbox', id: checkboxId }).addClass('select-checkbox');
            const trackButton = $('<label>').attr('for', checkboxId).addClass('track-button')
                .append($('<span>').addClass('track-text').text('Track this hotel'))
                .append($('<span>').addClass('tracking-text').text('Tracking'));

            cardFooter.append(checkboxInput, trackButton);
            card.append(cardFooter);
        
            fragment.append(card);
        });
        
        SELECTORS.resultsContainer.append(fragment);
        SELECTORS.resultsContainer.show();
        SELECTORS.submitText.show();
    };


    /**
     * Format hotel name for display.
     * @param {string} hotelName 
     * @returns {string} Formatted hotel name.
     */
    const formatHotelName = (hotelName) => {
        if (typeof hotelName !== 'string') return 'N/A';
        return hotelName
            .toLowerCase()
            .replace(/[_,-]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    /**
     * Format price with space as thousand separator.
     * @param {string|number} price
     * @returns {string} Formatted price with spaces.
     */
    const formatPrice = (price) => {
        if (price === null || price === undefined) return 'N/A';
        return String(price).replace(/,/g, ' ').replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    };

    /**
     * Handle checkbox state changes and update selected hotels.
     */
    const handleCheckboxChange = () => {
        console.log('[UI] Checkbox changed');
        const checkedCheckboxes = SELECTORS.resultsContainer.find('.select-checkbox:checked');
        console.log('[UI] Checked checkboxes:', checkedCheckboxes.length);

        SELECTORS.submitToSheetBtn.toggle(checkedCheckboxes.length > 0);

        state.selectedHotels = checkedCheckboxes.map(function () {
            const card = $(this).closest('.card');
            const hotelId = card.find('.hiddenHotelId').text();
            const hotelName = card.find('.card-header').text();
            const totalPrice = card.find('.total-price .amount').text().replace(/[^\d.-]/g, '');

            console.log('[UI] Selected Hotel Info:', { hotelId, hotelName, totalPrice });
            return { hotelId, hotelName, totalPrice };
        }).get();
    };

    /**
     * Toggle checkbox state when clicking on the container or checkbox.
     * @param {Event} event 
     */
    const toggleCheckbox = function (event) {
        event.stopPropagation();
        const target = $(event.target);
        const checkbox = target.hasClass('select-checkbox') ? target : target.find('.select-checkbox');

        if (checkbox.length) {
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        }
    };

    /**
     * Submit selected hotels to Sheety and send email.
     */
    const handleSubmitToSheety = async () => {
        if (!SELECTORS.locationInput.val().trim()) {
            alert('Please enter a location.');
            SELECTORS.locationInput.focus();
            return;
        }
        if (!state.locationCoordinates || Object.keys(state.locationCoordinates).length === 0) {
            alert('Please enter a valid location to fetch coordinates.');
            SELECTORS.locationInput.focus();
            return;
        }
        if (!state.datePicker.selectedDates || state.datePicker.selectedDates.length < 2) {
            alert('Please select check-in and check-out dates.');
            SELECTORS.datePickerInput.focus();
            return;
        }
        if (!SELECTORS.emailInput.val().trim()) {
            alert('Please enter your email address.');
            SELECTORS.emailInput.focus();
            return;
        }
        if (state.selectedHotels.length === 0) {
            alert('Please select at least one hotel to track.');
            return;
        }

        SELECTORS.loader.show();

        const formData = {
            location: SELECTORS.locationInput.val(),
            checkInDate: formatDateToLocalISOString(state.datePicker.selectedDates[0]),
            checkOutDate: formatDateToLocalISOString(state.datePicker.selectedDates[1]),
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
            email: SELECTORS.emailInput.val(),
            currency: SELECTORS.currencyInput.val(),
        };

        const formattedData = {
            selectedHotels: state.selectedHotels
        };

        try {
            const sheetyResult = await submitToSheety(formData, formattedData);

            if (sheetyResult && sheetyResult.price && sheetyResult.price.id) {
                console.log('[API] Data successfully submitted to Sheety:', sheetyResult);
            } else {
                console.warn('[API] Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
            }

            captureRedirectParameters();
            await sendEmailNotification(formData, formattedData);

            if (state.redirected) {
                showThankYouModal();
            } else {
                showFlightTrackingModal();
            }

            SELECTORS.confirmFlightTrackerBtn.off('click').on('click', function () {
                window.open(state.redirectUrl, '_blank');
                window.location.href = 'https://hotels.robotize.no/';
            });

            SELECTORS.btnSecondary.off('click').on('click', function () {
                console.log("[Modal] User declined flight tracking.");
                window.location.href = 'https://hotels.robotize.no/';
            });

            SELECTORS.thankYouOkBtn.off('click').on('click', function () {
                console.log("[Modal] User clicked OK on thank you modal.");
                window.location.href = 'https://hotels.robotize.no/';
            });

            SELECTORS.flightTrackingModal.on('hidden.bs.modal', function () {
                $('body').removeClass('modal-open');
            });

        } catch (error) {
            console.error('[Submit] Error during form submission:', error.message);
            SELECTORS.noResultsMessage.show().text('An error occurred during submission. Please try again.');
        } finally {
            SELECTORS.loader.hide();
        }
    };

    /**
     * Submit form data to Sheety.
     * @param {Object} formData 
     * @param {Object} formattedData 
     * @returns {Object} Sheety response data.
     */
    const submitToSheety = async (formData, formattedData) => {
        const data = {
            location: formData.location,
            checkInDate: formData.checkInDate,
            checkOutDate: formData.checkOutDate,
            adults: formData.adults,
            numberOfRooms: formData.numberOfRooms,
            email: formData.email,
            currency: formData.currency,
            selectedHotels: formattedData.selectedHotels.length > 0 ? formattedData.selectedHotels : [{ message: "No hotels selected" }]
        };

        console.log('[API] Submitting to Sheety with data:', JSON.stringify(data, null, 2));

        try {
            const response = await fetch(API_ENDPOINTS.sheety, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const text = await response.text();
            if (response.ok) {
                console.log('[API] Sheety response:', text);
                return JSON.parse(text);
            } else {
                throw new Error(`HTTP error ${response.status}: ${text}`);
            }
        } catch (error) {
            console.error('[API] Error sending data to Sheety:', error.message);
            throw error;
        }
    };

    /**
     * Send email notification via backend.
     * @param {Object} formData 
     * @param {Object} formattedData 
     */
    const sendEmailNotification = async (formData, formattedData) => {
        try {
            const hotelList = formattedData.selectedHotels.length > 0
                ? formattedData.selectedHotels.map(hotel =>
                    `<p style="margin:0 0 4px;font-size:13px;color:#5f6368;">• ${hotel.hotelName}</p>`
                ).join('')
                : '<p style="margin:0;font-size:13px;color:#5f6368;">No hotels selected</p>';

            const emailBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f7fa;">
    <tr>
      <td align="center" style="padding:30px 10px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#2e7d32,#1b5e20);padding:30px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600;">Welcome to the Hotel Robot</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your price tracker is now active</p>
            </td>
          </tr>
          <tr>
            <td style="padding:30px 40px;">
              <p style="color:#202124;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi,</p>
              <p style="color:#202124;font-size:15px;line-height:1.6;margin:0 0 20px;">
                We'll check hotel prices for you daily and notify you whenever there's a change. Here's a summary of your tracked trip:
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#e8f5e9;border-radius:10px;margin:0 0 20px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50%" style="padding:6px 0;">
                          <p style="margin:0;font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Check-in</p>
                          <p style="margin:2px 0 0;font-size:15px;color:#202124;font-weight:600;">${formData.checkInDate}</p>
                        </td>
                        <td width="50%" style="padding:6px 0;">
                          <p style="margin:0;font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Check-out</p>
                          <p style="margin:2px 0 0;font-size:15px;color:#202124;font-weight:600;">${formData.checkOutDate}</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="50%" style="padding:6px 0;">
                          <p style="margin:0;font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Adults</p>
                          <p style="margin:2px 0 0;font-size:15px;color:#202124;font-weight:600;">${formData.adults}</p>
                        </td>
                        <td width="50%" style="padding:6px 0;">
                          <p style="margin:0;font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Rooms</p>
                          <p style="margin:2px 0 0;font-size:15px;color:#202124;font-weight:600;">${formData.numberOfRooms}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;border-radius:8px;margin:0 0 20px;">
                <tr>
                  <td style="padding:16px;">
                    <p style="margin:0 0 8px;font-size:12px;color:#5f6368;text-transform:uppercase;letter-spacing:0.5px;">Selected Hotels</p>
                    ${hotelList}
                  </td>
                </tr>
              </table>
              <p style="color:#5f6368;font-size:14px;line-height:1.6;margin:0 0 24px;">
                You'll receive an email whenever the price changes. Reply to any of our emails if you have questions.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:#2e7d32;">
                    <a href="https://hotels.robotize.no" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">Visit Robotize Hotels</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px 30px;text-align:center;">
              <p style="color:#5f6368;font-size:14px;margin:0 0 16px;">Best regards,<br>Pierre</p>
              <a href="https://hotels.robotize.no"><img src="cid:logo" height="80" alt="Robotize" style="display:block;margin:0 auto;"></a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

            const emailResponse = await fetch(API_ENDPOINTS.sendEmail, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: "Welcome to the Hotel Robot",
                    body: emailBody,
                    recipient_email: formData.email
                })
            });

            if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error('[Email] Failed to send email:', errorData.message);
            } else {
                console.log('[Email] Email sent successfully');
            }
        } catch (error) {
            console.error('[Email] Error during email sending:', error.message);
        }
    };

    /**
     * Attach event listeners using event delegation where appropriate.
     */
    const attachEventListeners = () => {
        SELECTORS.searchForm.on('submit', handleSearchFormSubmit);
        SELECTORS.resultsContainer.on('change', '.select-checkbox', handleCheckboxChange);
        SELECTORS.submitToSheetBtn.on('click', handleSubmitToSheety);
    };

    /**
     * Initialize the application.
     */
    const init = async () => {
        try {
            state.datePicker = initializeDatePicker();
            console.log('[Init] Date Picker initialized:', state.datePicker);

            const queryParams = getQueryParams();

            if (!queryParams.currency) {
                setCurrencyFromIP();
            }

            console.log('[Init] Query Parameters:', queryParams);

            if (state.redirected && queryParams.city) {
                try {
                    const coordinates = await fetchCoordinates(queryParams.city);
                    state.locationCoordinates = coordinates;
                    console.log(`[Init] Fetched coordinates for ${queryParams.city}:`, coordinates);
                } catch (error) {
                    console.error(`[Init] Failed to fetch coordinates for ${queryParams.city}:`, error);
                    SELECTORS.noResultsMessage.show().text('Failed to fetch location data. Please try again.');
                    return;
                }
            }

            initializeFormFields(queryParams);
            console.log('[Init] Form fields initialized');

            initLocationInputListener();
            console.log('[Init] Location input listener initialized');

            attachEventListeners();
            console.log('[Init] Event listeners attached');

            console.log('[Init] Initialization complete');

        } catch (error) {
            console.error('[Init] Initialization error:', error);
            SELECTORS.noResultsMessage.show().text('Failed to initialize the page. Please try refreshing.');
        }
    };

    init();
});
