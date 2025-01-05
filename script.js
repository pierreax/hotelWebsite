$(document).ready(function () {
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
        ipGeo: 'https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f',
        getAccessToken: '/api/getAccessToken',
        getHotelOffersByCoordinates: '/api/getHotelOffersByCoordinates',
        sheety: '/api/sendDataToSheety',
        sendEmail: '/api/sendEmail',
        getFxRates: '/api/getFxRates',
        getCoordinatesByLocation: '/api/getCoordinatesByLocation',
    };

    // State Management
    const state = {
        accessToken: '',
        internalHotelIds: [],
        selectedHotels: [],
        locationCoordinates: {},
        conversionRates: {},
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
     * Helper function to post messages to the parent window
     */
    const postMessageToParent = (action, targetOrigin = "https://www.robotize.no") => {
        window.parent.postMessage({ action }, targetOrigin);
        console.log(`Sending ${action} to parent`);
    };

    /**
     * Scroll to top by sending a message to the parent
     */
    const scrollToTop = () => {
        postMessageToParent('scrollToTop');
    };

    /**
     * Capture redirect parameters after form submission.
     */
    const captureRedirectParameters = () => {
        state.redirectEmail = encodeURIComponent(SELECTORS.emailInput.val());
        state.redirectCurrency = encodeURIComponent(SELECTORS.currencyInput.val());
        state.redirectDateFrom = formatDateToLocalISOString(state.datePicker.selectedDates[0]);
        state.redirectDateTo = formatDateToLocalISOString(state.datePicker.selectedDates[1]);
        state.redirectUrl = `https://www.robotize.no/flights?email=${state.redirectEmail}&currency=${state.redirectCurrency}&city=${state.redirectCity}&dateFrom=${state.redirectDateFrom}&dateTo=${state.redirectDateTo}`;
        console.log('Redirect URL:', state.redirectUrl);
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
                instance.element.dispatchEvent(new Event('input'));
            }
        });
    };

    /**
     * Display the flight tracking modal.
     */
    const showFlightTrackingModal = () => {
        console.log('Displaying flight tracking modal.');
        SELECTORS.flightTrackingModal.modal('show');
        $('body').addClass('modal-open'); // Use jQuery for consistency
    };

    /**
     * Show the thank you modal.
     */
    const showThankYouModal = () => {
        console.log('Displaying thank you modal.');
        $('#thankYouModal').modal('show');
    };

    /**
     * Parse query parameters from the URL and set the `redirected` flag if parameters exist.
     * @returns {Object} Query parameters as key-value pairs.
     */
    const getQueryParams = () => {
        const params = new URLSearchParams(window.location.search);
        const queryParams = {};
        let redirectedFlag = false;

        for (const [key, value] of params.entries()) {
            queryParams[key] = value;
        }

        if (Object.keys(queryParams).length > 0) {
            if (queryParams.dateFrom || queryParams.dateTo || queryParams.email) {
                redirectedFlag = true;
                console.log('User has been redirected');
            }
        }

        if (redirectedFlag) {
            state.redirected = true;
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
    const fetchJSON = async (url, options = {}) => {
        try {
            const response = await fetch(url, options);
            const text = await response.text();
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${text}`);
            }
            return JSON.parse(text);
        } catch (error) {
            console.error(`Error fetching JSON from ${url}:`, error);
            throw error;
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
    };

    /**
     * Set currency based on IP geolocation asynchronously without blocking.
     * @returns {Promise<void>} A Promise that resolves when the currency is set or a fallback is applied.
     */
    const setCurrencyFromIP = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); // 3-second timeout

            const response = await fetch(API_ENDPOINTS.ipGeo, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();
            const currency = data.currency.code;

            console.log('Setting currency to:', currency);
            SELECTORS.currencyInput.val(currency).trigger('change');

        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Currency API call timed out. Using default currency.');
            } else {
                console.error('Failed to set currency from IP:', error);
            }
            // Fallback to default currency if API call fails or times out
            const defaultCurrency = 'USD'; // Change as per your preference
            SELECTORS.currencyInput.val(defaultCurrency).trigger('change');
        }
    };


    /**
     * Initialize location input listener with debouncing to prevent excessive API calls.
     */
    const initLocationInputListener = () => {
        let debounceTimeout;
        const debounceDelay = 500; // milliseconds

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
            console.log('Location input is empty. Clearing hotels and disabling search button.');
            // No action needed: search button remains disabled and results are cleared
            return;
        }

        try {
            console.log('Fetching coordinates for location:', location);
            const locationData = await fetchJSON(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(location)}`);
            console.log('Location data:', locationData);

            if (locationData && locationData.results.length > 0) {
                const firstResult = locationData.results[0];
                state.locationCoordinates = firstResult.geometry.location;
                console.log('Coordinates:', state.locationCoordinates);

                const cityComponent = firstResult.address_components.find(component => 
                    component.types.includes('locality') || component.types.includes('postal_town')
                );

                state.redirectCity = cityComponent ? cityComponent.long_name : '';
                console.log('City:', state.redirectCity || 'Not found');

                SELECTORS.searchBtn.prop('disabled', false);
            } else {
                console.log('No location results found.');
                SELECTORS.noResultsMessage.show().text('Location not found. Please try a different location.');
            }
        } catch (error) {
            console.error('Error handling location input:', error);
            SELECTORS.noResultsMessage.show().text('Failed to fetch location data. Please try again later.');
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

        // Retrieve form data
        const formData = {
            location: SELECTORS.locationInput.val(),
            dateRange: state.datePicker.selectedDates,
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
            email: SELECTORS.emailInput.val(),
            limitResults: parseInt($('#limitResults').val(), 10) || 20,
            formCurrency: SELECTORS.currencyInput.val(),
        };

        // Validate date range
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

        console.log('Form Data:', {
            location: formData.location,
            checkInDate,
            checkOutDate,
            email: formData.email,
            formCurrency: formData.formCurrency,
        });

        try {
            // Fetch FX Rates only if the currency has changed
            if (formData.formCurrency !== state.initialCurrency) {
                console.log('Fetching FX Rates for:', formData.formCurrency);
                const fxRatesData = await fetchJSON(`${API_ENDPOINTS.getFxRates}?baseCurrency=${formData.formCurrency}`);
                state.conversionRates = fxRatesData;
                state.initialCurrency = formData.formCurrency;
            } else {
                console.log('Using existing FX Rates for:', formData.formCurrency);
            }

            // CALL THE RAPID API FROM THE BACKEND HERE
            console.log('Fetching hotel offer for:', formData.location);
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
            const offersData = await fetchJSON(url);
            console.log('Hotel Offers Data:', offersData);

            if (offersData && offersData.data) {
                // Convert Prices
                const convertedOffers = convertPricesToFormCurrency(offersData.data, formData.formCurrency, state.conversionRates);
                console.log('Converted Offers:', convertedOffers);

                // Calculate Distances
                const offersWithDistance = calculateDistances(convertedOffers, state.locationCoordinates);
                console.log('Offers with Distance:', offersWithDistance);

                // Sort Offers by Distance
                offersWithDistance.sort((a, b) => a.distance - b.distance);
                console.log('Sorted Offers:', offersWithDistance);

                // Render Hotel Cards
                renderHotelCards(offersWithDistance, formData, numberOfNights);
            } else {
                SELECTORS.noResultsMessage.show().text('No hotels found for the selected location.');
            }
        } catch (error) {
            console.error('Error during form submission:', error.message);
            SELECTORS.noResultsMessage.show().text('An error occurred while fetching hotel data. Please try again.');
        } finally {
            SELECTORS.loader.hide();
        }
    };

    /**
     * Fetch hotel offers based on hotel IDs and form data.
     * @param {Array} hotelIds 
     * @param {Object} formData 
     * @param {string} checkInDate 
     * @param {string} checkOutDate 
     * @returns {Object|null} Offers data or null if no offers.
     */
    const fetchHotelOffers = async (hotelIds, formData, checkInDate, checkOutDate) => {
        const params = new URLSearchParams({
            hotelIds: hotelIds.join(','),
            adults: formData.adults,
            checkInDate,
            checkOutDate,
            roomQuantity: formData.numberOfRooms,
            paymentPolicy: 'NONE',
            bestRateOnly: 'true',
            includeClosed: 'false'
        }).toString();

        const url = `${API_ENDPOINTS.getHotelOffers}?${params}`;
        console.log('Fetching hotel offers with params:', params);

        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${state.accessToken}` }
            });

            const responseData = await response.json();
            console.log('Hotel offers response:', responseData);

            if (responseData.message) {
                SELECTORS.resultsContainer.html(`<div class="no-results-message">${responseData.message}</div>`);
                return null;
            }

            if (responseData.errors) {
                const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
            }

            return responseData;
        } catch (err) {
            console.error(`Failed to fetch hotel offers: ${err.message}`);
            throw err;
        }
    };

    /**
     * Convert hotel offer prices to the form's currency using conversion rates.
     * @param {Array} hotelOffers 
     * @param {string} formCurrency 
     * @param {Object} conversionRates 
     * @returns {Array} Converted hotel offers.
     */
    const convertPricesToFormCurrency = (hotelOffers, formCurrency, conversionRates) => {
        return hotelOffers.map(offer => {
            const priceData = offer.offers?.[0]?.price;
            if (priceData) {
                const originalCurrency = priceData.currency;
                const originalPrice = priceData.total;

                if (originalCurrency !== formCurrency) {
                    const rate = conversionRates[originalCurrency];
                    if (rate) {
                        const convertedPrice = originalPrice / rate;
                        offer.offers[0].price.total = Math.round(convertedPrice);
                    } else {
                        console.error(`Conversion rate not found for ${originalCurrency}`);
                    }
                }
            } else {
                console.error('Missing price data for offer:', offer);
            }
            return offer;
        });
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
            const hotelCoords = offer.hotel;
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
     * @param {number} numberOfNights 
     */
    const renderHotelCards = (offers, formData, numberOfNights) => {
        if (offers.length === 0) {
            console.log('No offers found, showing message to the user.');
            SELECTORS.resultsContainer.html('<div class="no-results-message">No valid hotel offers found. Please try different search criteria.</div>');
            return;
        }

        const fragment = $(document.createDocumentFragment());

        offers.forEach((offer) => {
            const totalPrice = Math.round(parseFloat(offer.offers[0].price.total));
            const pricePerNight = numberOfNights > 0
                ? Math.round((totalPrice / numberOfNights).toFixed(2))
                : 'N/A';
            const currencySymbol = formData.formCurrency;

            const card = $('<div>').addClass('card');

            // Hidden Hotel ID
            $('<div>')
                .addClass('hiddenHotelId')
                .text(offer.hotel.hotelId)
                .hide()
                .appendTo(card);

            // Card Header
            const cardHeader = $('<div>').addClass('card-header');
            $('<div>')
                .addClass('hotel-name')
                .text(formatHotelName(offer.hotel.name))
                .appendTo(cardHeader);

            // Room type - Only append if available
            if (offer.offers[0].room && offer.offers[0].room.typeEstimated && offer.offers[0].room.typeEstimated.category) {
                const roomType = formatRoomType(offer.offers[0].room.typeEstimated.category);
                $('<div>')
                    .addClass('room-type')
                    .text(roomType)
                    .appendTo(cardHeader);
            }

            card.append(cardHeader);

            // Distance Display
            $('<div>')
                .addClass('distance')
                .text(offer.distanceDisplay)
                .appendTo(card);

            // Checkbox Container
            const checkboxContainer = $('<div>').addClass('checkbox-container');
            checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to Robot: '));
            checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));
            card.append(checkboxContainer);

            // Card Content
            const cardContent = $('<div>').addClass('card-content');
            $('<div>').addClass('price-per-night')
                .append($('<span>').addClass('label').text('Per Night: '))
                .append($('<span>').addClass('amount').text(`${currencySymbol} ${pricePerNight}`))
                .appendTo(cardContent);
            $('<div>').addClass('total-price')
                .append($('<span>').addClass('label').text('Total: '))
                .append($('<span>').addClass('amount').text(`${currencySymbol} ${totalPrice}`))
                .appendTo(cardContent);
            card.append(cardContent);

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
     * Format room type for display.
     * @param {string} roomType 
     * @returns {string} Formatted room type.
     */
    const formatRoomType = (roomType) => {
        if (typeof roomType !== 'string') return 'N/A';
        return roomType
            .toLowerCase()
            .replace(/[_,-]/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    /**
     * Handle checkbox state changes and update selected hotels.
     */
    const handleCheckboxChange = () => {
        console.log('Checkbox changed');

        const checkedCheckboxes = SELECTORS.resultsContainer.find('.select-checkbox:checked');
        console.log('Checked checkboxes:', checkedCheckboxes.length);

        // Toggle the Submit button based on the number of selected checkboxes
        SELECTORS.submitToSheetBtn.toggle(checkedCheckboxes.length > 0);

        // Update the selectedHotels array in the state
        state.selectedHotels = checkedCheckboxes.map(function () {
            const card = $(this).closest('.card');
            const hotelId = card.find('.hiddenHotelId').text();
            const hotelName = card.find('.hotel-name').text();
            const roomType = card.find('.room-type').text() || 'N/A';
            const pricePerNight = card.find('.price-per-night .amount').text();
            const totalPrice = card.find('.total-price .amount').text();

            console.log('Selected Hotel Info:', {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            });

            return {
                hotelId,
                hotelName,
                roomType,
                pricePerNight,
                totalPrice
            };
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
            // Toggle the checked property and trigger change event
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        }
    };

    /**
     * Submit selected hotels to Sheety and send email.
     */
    const handleSubmitToSheety = async () => {
        console.log('Submitting data to SHEETY');
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
            // Submit to Sheety
            const sheetyResult = await submitToSheety(formData, formattedData);

            // Confirm Sheety submission
            if (sheetyResult && sheetyResult.price && sheetyResult.price.id) {
                console.log('Data successfully submitted to Sheety:', sheetyResult);
            } else {
                console.warn('Data submitted to Sheety but did not receive a success confirmation:', sheetyResult);
            }

            // Capture redirect parameters
            captureRedirectParameters();

            // Send email notification
            await sendEmailNotification(formData, formattedData);

            // Scroll to top before showing the modal at the top
            scrollToTop();

            // Initialize the modal based on whether the user has been redirected
            if (state.redirected) {
                // If user was redirected, show the thank you modal
                showThankYouModal();
            } else {
                // Show flight tracking modal
                showFlightTrackingModal();
            }

            // Handle flight tracking confirmation
            SELECTORS.confirmFlightTrackerBtn.off('click').on('click', function () {
                window.open(state.redirectUrl, '_blank');    // Navigate to redirect to the other site in a new tab
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // Handle flight tracking decline
            SELECTORS.btnSecondary.off('click').on('click', function () {
                console.log("User declined flight tracking.");
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // Handle OK button in modal
            SELECTORS.thankYouOkBtn.off('click').on('click', function () {
                console.log("User clicked OK on thank you modal.");
                window.location.href = 'https://robotize-hotels.azurewebsites.net/';  // Refresh the form page
            });

            // If the modal is closed, remove the modal-open class from body to restore scrolling
            SELECTORS.flightTrackingModal.on('hidden.bs.modal', function () {
                $('body').removeClass('modal-open');
            });

        } catch (error) {
            console.error('Error during form submission:', error.message);
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

        console.log('Submitting to Sheety with data:', JSON.stringify(data, null, 2));

        try {
            const response = await fetch(API_ENDPOINTS.sheety, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const text = await response.text();
            if (response.ok) {
                console.log('Sheety response:', text);
                return JSON.parse(text);
            } else {
                throw new Error(`HTTP error ${response.status}: ${text}`);
            }
        } catch (error) {
            console.error('Error sending data to Sheety:', error.message);
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
            const emailResponse = await fetch(API_ENDPOINTS.sendEmail, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    subject: "Welcome to the Hotel Robot",
                    body: `
                        Welcome to the Hotel Robot!<br><br>
                        We will check prices for you daily, and let you know if there is a change.<br><br>
                        Here are your details:<br><br>
                        Location: ${formData.location}<br>
                        Check-In Date: ${formData.checkInDate}<br>
                        Check-Out Date: ${formData.checkOutDate}<br>
                        Adults: ${formData.adults}<br>
                        Number of Rooms: ${formData.numberOfRooms}<br>
                        Email: ${formData.email}<br>
                        Currency: ${formData.currency}<br>
                        Selected Hotels:<br>
                        ${formattedData.selectedHotels.length > 0
                            ? formattedData.selectedHotels.map(hotel => `- ${hotel.hotelName}<br>`).join('')
                            : 'No hotels selected'}<br><br>
                        Thank you!
                    `,
                    recipient_email: formData.email
                })
            });

            if (!emailResponse.ok) {
                const errorData = await emailResponse.json();
                console.error('Failed to send email:', errorData.message);
            } else {
                console.log('Email sent successfully');
            }
        } catch (error) {
            console.error('Error during email sending:', error.message);
        }
    };

    /**
     * Attach event listeners using event delegation where appropriate.
     */
    const attachEventListeners = () => {
        // Handle search form submission
        SELECTORS.searchForm.on('submit', handleSearchFormSubmit);
        
        // Handle checkbox state changes
        SELECTORS.resultsContainer.on('change', '.select-checkbox', handleCheckboxChange);

        // Handle submit to Sheety button
        SELECTORS.submitToSheetBtn.on('click', handleSubmitToSheety);

        // Handle currency change
        SELECTORS.currencyInput.on('change', async function() {
            const selectedCurrency = $(this).val();
            console.log('Currency changed to:', selectedCurrency);
            try {
                console.log('Fetching FX Rates for:', selectedCurrency);
                state.conversionRates = await fetchJSON(`${API_ENDPOINTS.getFxRates}?baseCurrency=${selectedCurrency}`);
                state.initialCurrency = selectedCurrency;
                console
            } catch (error) {
                console.error('Failed to fetch FX Rates:', error);
            }
        });
    };

    /**
     * Initialize the application.
     */
    const init = async () => {
        try {
            // Initialize components
            state.datePicker = initializeDatePicker();
            console.log('Date Picker initialized:', state.datePicker);

            // Get query parameters
            const queryParams = getQueryParams();

            // Only set currency from IP if 'currency' is not present in query params
            if (!queryParams.currency) {
                setCurrencyFromIP(); // Do not await; let it run in the background
            }

            console.log('Query Parameters:', queryParams);

            // Initialize form fields
            initializeFormFields(queryParams);

            console.log('Form fields initialized');

            // Initialize location input listener
            initLocationInputListener();

            console.log('Location input listener initialized');

            // Attach event listeners
            attachEventListeners();

            console.log('Event listeners attached');

            // Fetch FX Rates after currency is set
            const formCurrency = SELECTORS.currencyInput.val(); // Get the currency after it's set
            if (formCurrency) {
                console.log('Fetching FX Rates for:', formCurrency);
                state.conversionRates = await fetchJSON(`${API_ENDPOINTS.getFxRates}?baseCurrency=${formCurrency}`);
                state.initialCurrency = formCurrency;
                console.log('Conversion Rates:', state.conversionRates);
            }

            console.log('Initialization complete');

        } catch (error) {
            console.error('Initialization error:', error);
            SELECTORS.noResultsMessage.show().text('Failed to initialize the page. Please try refreshing.');
        }
    };

    // Initialize the script
    init();
});
