$(document).ready(function() {

    // Initialize Flatpickr for date range selection
    const datePicker = flatpickr('.datepicker', {
        mode: "range",
        dateFormat: "j M Y", // Format for display (e.g., "24 Jan 2024")
        altInput: true,
        altFormat: "j M Y", // Display format for the user
        minDate: 'today',
        onChange: function(selectedDates, dateStr, instance) {
            // Trigger input event for further processing
            instance.element.dispatchEvent(new Event('input'));
        }
    });

    // Currencies and City based on IP-location
    $.get('https://api.ipgeolocation.io/ipgeo?apiKey=420e90eecc6c4bb285f238f38aea898f', function(response) {
        currency = response.currency.code;
        console.log('Setting currency to:',currency);
        // Update the currency based on the IP-response
        $('#currency').val(currency).trigger('change');
    });

    $('#searchForm').on('submit', async function(event) {
        event.preventDefault();
        $('#noResultsMessage').hide();
        $('#submitText').hide();



        // Show the loading icon
        $('.loader').show();

        // Retrieve form data
        const location = $('#location').val();
        const dateRange = datePicker.selectedDates; // Access Flatpickr instance correctly
        const adults = $('#adults').val(); // Will be "2" by default
        const numberOfRooms = $('#numberOfRooms').val(); // Will be "1" by default
        const email = $('#email').val();
        const limitResults = parseInt($('#limitResults').val(), 10);
        const formCurrency = $('#currency').val();

        // Convert selected dates to required format
        const checkInDate = dateRange[0] ? dateRange[0].toISOString().split('T')[0] : '';
        const checkOutDate = dateRange[1] ? dateRange[1].toISOString().split('T')[0] : '';
        const numberOfNights = dateRange[1] && dateRange[0] ? Math.round((dateRange[1] - dateRange[0]) / (1000 * 60 * 60 * 24)) : 0;

        // Validate date range
        if (!checkInDate || !checkOutDate || numberOfNights <= 0) {
            alert('Please enter valid check-in and check-out dates.');
            // Focus on the datepicker input field
            $('.datepicker').focus();
            
            $('.loader').hide(); // Hide the loading icon
            return;
        }

        console.log('Form Data:', {
            location,
            checkInDate,
            checkOutDate,
            adults,
            numberOfRooms,
            email,
            formCurrency,
        });

        // API URLs
        const getAccessTokenUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetAmadeusAccessToken?code=8-Ok9mpy3X22aWVQSXBs_djXz57bJvh23XJAPuY-yH9jAzFu8nDFaA%3D%3D';
        const getHotelsByCoordinatesUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelsByCoordinates?code=_9_S3ATWEtYncsW6pzX2gKatTmRWbkHKc9O2GsD-74BqAzFupvm9kA%3D%3D';
        const getHotelOffersUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetHotelOffers?code=N5p8k9qzS_NgW_h2mHWm_xKOpPHY2Cjb_nh_TCturrA5AzFuCXBy-g%3D%3D';
        const getCoordinatesByLocationUrl = 'https://hotelfunctionapp.azurewebsites.net/api/GetCoordinatesByLocation?code=tyHMhU1QpcgHHWUrwfor8PtyYEzW-keeu2daJnRQqdQxAzFuPgYxzA%3D%3D';
        const sheetyUrl = 'https://hotelfunctionapp.azurewebsites.net/api/SendDataToSheety?code=WB185Wd0xWtqP1DMGlKF1WnHLt8TXwpm8QXDzTlulg6FAzFuFvQ-2A%3D%3D';
        const conversionApiUrl = 'https://v6.exchangerate-api.com/v6/0fdee0a5645b6916b5a20bb3/latest/';

        let accessToken;
        let internalHotelIds = [];
        let locationCoordinates;
        let selectedHotels = [];

        async function convertCurrency(amount, fromCurrency, toCurrency) {
            const url = `${conversionApiUrl}${fromCurrency}`;
            const response = await fetch(url);
            const data = await response.json();
            const rate = data.conversion_rates[toCurrency];
            if (!rate) {
                throw new Error(`No conversion rate available for ${toCurrency}`);
            }
            return amount * rate;
        }

        async function getLocationCoordinates(location) {
            const apiUrl = `${getCoordinatesByLocationUrl}&location=${encodeURIComponent(location)}`;
            const response = await fetch(apiUrl);
            const text = await response.text();
            try {
                const data = JSON.parse(text);
                locationCoordinates = data;
                return data;
            } catch (err) {
                throw new Error(`Response is not valid JSON: ${text}`);
            }
        }

        async function fetchHotelOffers(validHotelIds) {
            const limitedHotelIds = validHotelIds.slice(0, limitResults);
            const params = `hotelIds=${limitedHotelIds.join(',')}&adults=${adults}&checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&roomQuantity=${numberOfRooms}&paymentPolicy=NONE&bestRateOnly=true&includeClosed=false`;
            const url = `${getHotelOffersUrl}&params=${encodeURIComponent(params)}`;
            console.log('Fetching hotel offers with params:', params);
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const text = await response.text();
            try {
                const responseData = JSON.parse(text);
                console.log('Hotel offers response:', responseData);
                if (responseData.errors) {
                    const errorDetails = responseData.errors.map(err => `Code: ${err.code}, Detail: ${err.detail}`).join('; ');
                    throw new Error(`Failed to fetch hotel offers: ${errorDetails}`);
                }
                return responseData;
            } catch (err) {
                throw new Error(`Failed to parse hotel offers response: ${text}`);
            }
        }

        async function convertPricesToFormCurrency(hotelOffers, originalCurrency) {
            return Promise.all(hotelOffers.map(async offer => {
                const price = parseFloat(offer.offers[0].price.total);
                if (originalCurrency !== formCurrency) {
                    const convertedPrice = await convertCurrency(price, originalCurrency, formCurrency);
                    offer.offers[0].price.total = convertedPrice.toFixed(2);
                    offer.offers[0].price.currency = formCurrency;
                }
                return offer;
            }));
        }

        // We dont need this function for now, will be used in later stage
        function filterOffersByPrice(hotelOffers, priceLimit, numberOfNights) {
            console.log('Filtering offers by price. Price Limit:', priceLimit, 'Number of Nights:', numberOfNights);

            return hotelOffers.map(offer => {
                const totalPrice = parseFloat(offer.offers[0].price.total);
                const pricePerNight = totalPrice / numberOfNights;

                console.log('Offer ID:', offer.hotel.hotelId, 'Total Price:', totalPrice, 'Price Per Night:', pricePerNight);

                return {
                    ...offer,
                    pricePerNight: pricePerNight.toFixed(2)
                };
            }).filter(offer => {
                return parseFloat(offer.pricePerNight) <= priceLimit;
            });
        }

        

        async function submitToSheety(formData, formattedData) {
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
                const response = await fetch(sheetyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                });

                // Check for non-JSON responses and handle accordingly
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
            } finally {
                // Hide the loading icon
                $('.loader').hide();
            }
        }

        function handleCheckboxChange() {
            console.log('Checkbox changed');
        
            // Get all checked checkboxes
            const checkedCheckboxes = $('#resultsBox .card input[type="checkbox"]:checked');
            console.log('Checked checkboxes:', checkedCheckboxes.length);
        
            // Toggle the submit button visibility based on whether any checkboxes are checked
            $('#submitToSheet').toggle(checkedCheckboxes.length > 0);
        
            // Extract and log information from each selected card
            selectedHotels = checkedCheckboxes.map(function() {
                const card = $(this).closest('.card');
                const hotelId = card.find('.hiddenHotelId').text();
                const hotelName = card.find('.hotel-name').text();
                const roomType = card.find('.room-type').text();
                const pricePerNight = card.find('.price-per-night .amount').text();
                const totalPrice = card.find('.total-price .amount').text();
        
                // Log the extracted information
                console.log('Selected Hotel Info:', {
                    hotelId,
                    hotelName,
                    roomType,
                    pricePerNight,
                    totalPrice
                });
        
                // Return the data to be stored in selectedHotels array
                return {
                    hotelId,
                    hotelName,
                    roomType,
                    pricePerNight,
                    totalPrice
                };
            }).get();
        }
        
        
             

        function formatHotelName(hotelName) {
            if (typeof hotelName !== 'string') return 'N/A';
            return hotelName
                .toUpperCase()
                .replace(/_/g, ' ')
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }


        function formatRoomType(roomType) {
            if (typeof roomType !== 'string') return 'N/A';
            return roomType
                .toUpperCase()
                .replace(/_/g, ' ')
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
        }

        function calculateDistance(lat1, lon1, lat2, lon2) {
            const R = 6371; // Radius of the Earth in km
            const dLat = (lat2 - lat1) * (Math.PI / 180);
            const dLon = (lon2 - lon1) * (Math.PI / 180);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            const distance = R * c;
            return distance.toFixed(2); // Distance in km
        }

        // Function to reset the form and clear all variables
        function resetForm() {
            $('#searchForm')[0].reset(); // Reset the form fields
        
            // Reset dropdowns explicitly if needed
            $('#adults').val('2');
            $('#numberOfRooms').val('1');
        
            // Hide the results box and clear the results
            $('#resultsBox').hide();
            $('#results tbody').empty();
        
            // Hide the submit button as there are no results
            $('#submitToSheet').hide();
        
            // Clear all relevant variables
            locationCoordinates = null; // Clear location coordinates
            internalHotelIds = []; // Clear hotel IDs
            selectedHotels = []; // Clear selected hotels
        
            // Optionally reset any other variables that may be in use
            accessToken = null; // Clear access token
            isSubmitting = false; // Reset the submission flag
            datePicker.clear(); // Clear Flatpickr instance if applicable

            // Explicitly set default values
            $('#adults').val('2'); // Ensure default value is set
            $('#numberOfRooms').val('1'); // Ensure default value is set
        
            // Hide the submittext
            $('#submitText').hide();
        }
        


        $('#submitToSheet').off('click').on('click', async function() {
            console.log('Submitting data to SHEETY');
        
            // Show the loader before starting the submission
            $('.loader').show();
        
            const formData = {
                location,
                checkInDate,
                checkOutDate,
                adults,
                numberOfRooms,
                email,
                currency: formCurrency,
            };
        
            const formattedData = {
                selectedHotels
            };
        
            try {
                // Submit to Sheety
                const sheetyResult = await submitToSheety(formData, formattedData);
        
                // Show success alert regardless of email status
                alert('Thank you for your submission, we will keep you updated on the lowest prices for your selection!');
        
                // Reset form and hide results after submission
                resetForm(); 

                // Use or update the form currency as needed here
                $('#currency').val(formCurrency).trigger('change'); // Update the currency in the form
        
                // Attempt to send email via Azure Function after the user alert
                try {
                    const emailResponse = await fetch('https://hotelfunctionapp.azurewebsites.net/api/SendMail?code=M4SsG9-Y-KkKq0tVZR3gL8SzUjkkrvEiZ5--G03OrLjkAzFuQjUgGg%3D%3D', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            subject: "New submission for your Hotel Robot",
                            body: `Great news, somebody just signed up for your Hotel Robot! Here are the details:<br><br>
                                Location: ${location}<br>
                                Check-In Date: ${checkInDate}<br>
                                Check-Out Date: ${checkOutDate}<br>
                                Adults: ${adults}<br>
                                Number of Rooms: ${numberOfRooms}<br>
                                Email: ${email}<br>
                                Currency: ${formCurrency}<br>
                                Selected Hotels:<br>
                                ${formattedData.selectedHotels.length > 0 
                                    ? formattedData.selectedHotels.map(hotel => 
                                        `- ${hotel.hotelName} - ${hotel.price}<br>`
                                    ).join('') 
                                    : 'No hotels selected'}<br><br>
                                Thank you!`,
                            recipient_email: email
                        })
                    });
        
                    if (!emailResponse.ok) {
                        console.error('Failed to send email.');
                    }
                } catch (emailError) {
                    console.error('Error during email sending:', emailError.message);
                }
            } catch (error) {
                console.error('Error during form submission:', error.message);
            } finally {
                // Hide the loading icon after the submission completes
                $('.loader').hide();


                //window.location.reload(); // Reload the page skip for now
            }
        });
        

        // Attach event listener to all existing checkboxes
        $('#resultsBox').on('change', 'input[type="checkbox"]', handleCheckboxChange);

        try {
            const tokenResponse = await fetch(getAccessTokenUrl);
            const tokenData = await tokenResponse.json();
            accessToken = tokenData.access_token;
        
            const coords = await getLocationCoordinates(location);
            if (!coords || !coords.latitude || !coords.longitude) {
                throw new Error('Invalid coordinates received');
            }
            const { latitude, longitude } = coords;
            const getHotelsByCoordinatesUrlWithParams = `${getHotelsByCoordinatesUrl}&latitude=${latitude}&longitude=${longitude}&radius=10&radiusUnit=KM&hotelSource=ALL`;
        
            const hotelsResponse = await fetch(getHotelsByCoordinatesUrlWithParams, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            const hotelsData = await hotelsResponse.json();
            console.log('Hotels in the area:',hotelsData);
        
            const resultsContainer = $('#resultsBox'); // Use the results box to hold the cards
            resultsContainer.empty();
        
            if (hotelsData && hotelsData.data && hotelsData.data.length > 0) {
                internalHotelIds = hotelsData.data.map(hotel => hotel.hotelId);
                const hotelIds = internalHotelIds.slice(0, limitResults);
        
                const offersData = await fetchHotelOffers(hotelIds);
                const originalCurrency = offersData.data[0]?.offers[0]?.price?.currency || formCurrency;
                const convertedOffers = await convertPricesToFormCurrency(offersData.data, originalCurrency);
        
                if (convertedOffers.length > 0) {
                    convertedOffers.forEach(offer => {
                        const totalPrice = parseFloat(offer.offers[0].price.total); // Total price for the stay
                        const pricePerNight = numberOfNights > 0 ? (totalPrice / numberOfNights).toFixed(2) : 'N/A'; // Price per night

                        const card = $('<div>').addClass('card');

                        // Add hotelId in a hidden element
                        const hiddenHotelId = $('<div>').addClass('hiddenHotelId').text(offer.hotel.hotelId).hide();
                        card.append(hiddenHotelId);
                        
                        // Card Header with hotel name
                        const cardHeader = $('<div>').addClass('card-header');
                        cardHeader.append($('<div>').text(formatHotelName(offer.hotel.name)).addClass('hotel-name'));
                        
                        // Add room type below hotel name
                        const roomType = $('<div>').text(offer.offers[0].room ? formatRoomType(offer.offers[0].room.typeEstimated.category) : 'N/A').addClass('room-type');
                        cardHeader.append(roomType);
                        
                        // Add the distance in a separate container
                        const distanceContainer = $('<div>').addClass('distance').text(`${calculateDistance(locationCoordinates.latitude, locationCoordinates.longitude, offer.hotel.latitude, offer.hotel.longitude)} km`);
                        card.append(distanceContainer);
                        
                        // Create a single .card-content div for all other information
                        const cardContent = $('<div>').addClass('card-content');

                        
                        // Add price per night
                        const pricePerNightDiv = $('<div>').addClass('price-per-night');
                        pricePerNightDiv.append($('<span>').addClass('label').text('Per Night: '));
                        pricePerNightDiv.append($('<span>').addClass('amount').text(pricePerNight)); // Correctly append pricePerNight
                        cardContent.append(pricePerNightDiv);

                        // Add total price
                        const totalPriceDiv = $('<div>').addClass('total-price');
                        totalPriceDiv.append($('<span>').addClass('label').text('Total: '));
                        totalPriceDiv.append($('<span>').addClass('amount').text(totalPrice.toFixed(2))); // Correctly append totalPrice
                        cardContent.append(totalPriceDiv);


                        // Create a container for the checkbox and its label
                        const checkboxContainer = $('<div>').addClass('checkbox-container');

                        // Add the descriptive text
                        checkboxContainer.append($('<span>').addClass('checkbox-description').text('Add to robot-selection: '));

                        // Add the checkbox
                        checkboxContainer.append($('<input>').attr('type', 'checkbox').addClass('select-checkbox'));

                        // Add the container to the card content
                        cardContent.append(checkboxContainer);

                        
                        // Append the header and content to the card
                        card.append(cardHeader);
                        card.append(cardContent);
                        
                        // Append the card to the results container
                        resultsContainer.append(card);
                    });                
                } else {
                    resultsContainer.html('<div class="no-results-message">No results found</div>');
                }
                
                $('#resultsBox').show();
                $('#submitText').show();

            } else {
                $('#noResultsMessage').show();
            }
        } catch (error) {
            console.error('Error:', error.message);
            $('#resultsBox').show();
            resultsContainer.html('<div class="no-results-message">No results found</div>');
        } finally {
            $('.loader').hide();
        }
        
    });
});