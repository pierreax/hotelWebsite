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

        for (const [key, value] of params.entries()) {
            queryParams[key] = value;
        }

        if (Object.keys(queryParams).length > 0) {
            if (queryParams.dateFrom || queryParams.dateTo || queryParams.email || queryParams.city) {
                state.redirected = true;
                console.log('User has been redirected with parameters:', queryParams);
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
            console.error('Error in fetchCoordinates:', error);
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
            const coordinates = await fetchCoordinates(location);
            state.locationCoordinates = coordinates;
            console.log('Coordinates:', state.locationCoordinates);

            // Optionally, you can extract the city name from coordinates if needed
            const locationData = await fetchJSON(`${API_ENDPOINTS.getCoordinatesByLocation}?location=${encodeURIComponent(location)}`);
            const cityComponent = locationData.results[0].address_components.find(component => 
                component.types.includes('locality') || component.types.includes('postal_town')
            );

            state.redirectCity = cityComponent ? cityComponent.long_name : '';
            console.log('City:', state.redirectCity || 'Not found');

            SELECTORS.searchBtn.prop('disabled', false);
        } catch (error) {
            console.error('Error handling location input:', error);
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

        // Retrieve form data
        const formData = {
            location: SELECTORS.locationInput.val(),
            dateRange: state.datePicker.selectedDates,
            adults: $('#adults').val(),
            numberOfRooms: $('#numberOfRooms').val(),
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

        // Ensure that coordinates are available
        if (!state.locationCoordinates || Object.keys(state.locationCoordinates).length === 0) {
            alert('Please enter a valid location to fetch coordinates.');
            SELECTORS.locationInput.focus();
            SELECTORS.loader.hide();
            return;
        }

        console.log('Form Data:', {
            location: formData.location,
            checkInDate,
            checkOutDate,
            formCurrency: formData.formCurrency,
        });

        try {
            // CALL THE RAPID API FROM THE BACKEND HERE
            console.log('Fetching hotel offers for:', formData.location,state.locationCoordinates.lat,state.locationCoordinates.lng, checkInDate, checkOutDate, formData.adults, formData.numberOfRooms, formData.formCurrency);
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
            offersData = offersData.data.result; // Extract the result from the response
            console.log('Hotel Offers Data:', offersData);

            if (offersData.length > 0) {
                // Calculate Distances
                const offersWithDistance = calculateDistances(offersData, state.locationCoordinates);
                console.log('Offers with Distance:', offersWithDistance);

                // Sort Offers by Distance
                offersWithDistance.sort((a, b) => {
                    const distanceA = convertToMeters(a.distanceDisplay);
                    const distanceB = convertToMeters(b.distanceDisplay);
                    return distanceA - distanceB;
                });
                console.log('Sorted Offers:', offersWithDistance);

                // Render Hotel Cards
                console.log('Rendering hotel cards...');
                renderHotelCards(offersWithDistance, formData);
                SELECTORS.emailInput.show(); // Show email input after showing results
            } else {
                SELECTORS.noResultsMessage.show().text('No hotels found for the selected location.');
                SELECTORS.emailInput.hide(); // Hide email input if no results are found

            }
        } catch (error) {
            console.error('Error during form submission:', error.message);
            SELECTORS.noResultsMessage.show().text('An error occurred while fetching hotel data. Please try again.');
            SELECTORS.emailInput.hide(); // Hide email input if no results are found
        } finally {
            SELECTORS.loader.hide();
        }
    };


    //  --------- HELPER FUNCTIONS HERE ---------- //

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
        return numericValue; // Assume the unit is meters if not specified
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
            console.log('No offers found, showing message to the user.');
            SELECTORS.resultsContainer.html('<div class="no-results-message">No valid hotel offers found. Please try different search criteria.</div>');
            return;
        }

        const fragment = $(document.createDocumentFragment());

        offers.forEach((offer) => {
            const totalPrice = offer.composite_price_breakdown.gross_amount.amount_rounded;
            const pricePerNight = offer.composite_price_breakdown.gross_amount_per_night.amount_rounded;
        
            const card = $('<div>').addClass('card');
        
            // Hidden Hotel ID
            $('<div>')
                .addClass('hiddenHotelId')
                .text(offer.hotel_id)
                .appendTo(card);
        
            // Card Header
            $('<div>')
                .addClass('card-header')
                .text(formatHotelName(offer.hotel_name))
                .appendTo(card);
        
            // Card Content with Prices and Badges
            const cardContent = $('<div>').addClass('card-content');

            // Prices Section
            const pricesDiv = $('<div>').addClass('prices');
            $('<div>').addClass('price-per-night')
                .append($('<span>').addClass('amount').text(`${pricePerNight}`))
                .append($('<span>').addClass('label').text('per night'))
                .appendTo(pricesDiv);
            $('<div>').addClass('total-price')
                .append($('<span>').addClass('amount').text(`${totalPrice}`))
                .append($('<span>').addClass('label').text('in total'))
                .appendTo(pricesDiv);
            cardContent.append(pricesDiv);

            // Badges Section
            const badgesDiv = $('<div>').addClass('badges');
            $('<div>').addClass('badge distance')
                .text(offer.distanceDisplay)
                .appendTo(badgesDiv);
            $('<div>').addClass('badge rating')
                .text(`Rating: ${offer.review_score}`)
                .appendTo(badgesDiv);
            cardContent.append(badgesDiv);

            card.append(cardContent);
        
            // Card Footer with Checkbox
            const cardFooter = $('<div>').addClass('card-footer');
            const checkboxContainer = $('<div>').addClass('checkbox-container');
        
            // Create a unique ID for the checkbox
            const checkboxId = `checkbox-${offer.hotel_id}`;
        
            // Label for the checkbox
            const checkboxLabel = $('<label>')
                .attr('for', checkboxId)
                .addClass('checkbox-description')
                .text('Add to Robot:');
        
            // Checkbox input
            const checkboxInput = $('<input>')
                .attr({
                    type: 'checkbox',
                    id: checkboxId
                })
                .addClass('select-checkbox');
        
            checkboxContainer.append(checkboxLabel, checkboxInput);
            cardFooter.append(checkboxContainer);
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
            const hotelName = card.find('.card-header').text(); // Updated to find 'card-header'
            const totalPrice = card.find('.total-price .amount').text().replace(/[^\d.-]/g, ''); // Remove currency text

            console.log('Selected Hotel Info:', {
                hotelId,
                hotelName,
                totalPrice
            });

            return {
                hotelId,
                hotelName,
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
        if (SELECTORS.emailInput.val() === '') {
            SELECTORS.emailInput.focus();
            return;
        }

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

            // If redirected and city is present, fetch coordinates
            if (state.redirected && queryParams.city) {
                try {
                    const coordinates = await fetchCoordinates(queryParams.city);
                    state.locationCoordinates = coordinates;
                    console.log(`Fetched coordinates for ${queryParams.city}:`, coordinates);
                } catch (error) {
                    console.error(`Failed to fetch coordinates for ${queryParams.city}:`, error);
                    SELECTORS.noResultsMessage.show().text('Failed to fetch location data. Please try again.');
                    return; // Exit initialization if coordinates cannot be fetched
                }
            }

            // Initialize form fields
            initializeFormFields(queryParams);

            console.log('Form fields initialized');

            // Initialize location input listener
            initLocationInputListener();

            console.log('Location input listener initialized');

            // Attach event listeners
            attachEventListeners();

            console.log('Event listeners attached');

            console.log('Initialization complete');

        } catch (error) {
            console.error('Initialization error:', error);
            SELECTORS.noResultsMessage.show().text('Failed to initialize the page. Please try refreshing.');
        }
    };

    // Initialize the script
    init();
});
